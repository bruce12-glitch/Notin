import prisma from '../config/db.js';
import { deleteAttachmentsForNote } from './attachmentController.js';
import { logError } from '../lib/logging.js';

export const createNote = async (req, res) => {
  const { title, description, contentJson, contentText, notebookId } = req.body;
  const userId = req.userId;

  try {
    // WP-APP-005: optional notebook assignment on create (ownership-checked)
    let nbId = null;
    if (notebookId !== undefined && notebookId !== null && notebookId !== '') {
      const nb = await prisma.notebook.findFirst({ where: { id: String(notebookId), userId } });
      if (!nb) return res.status(400).json({ message: 'Unknown notebook' });
      nbId = nb.id;
    }
    const note = await prisma.note.create({
      data: { title: title || 'Untitled', description: description || contentText || '', contentJson, contentText: contentText || description || '', notebookId: nbId, userId },
    });
    res.status(201).json(note);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to create note' });
  }
};

export const getNotes = async (req, res) => {
  const userId = req.userId;
  // Support ?filter=active|trash|all and legacy ?trash=0|1, ?isTrashed, ?trashed
  // WP-APP-004: optional ?q=<string> — full-text search (title / contentText / description)
  // WP-APP-005: optional ?notebookId=<id|none> — 'none'/'unfiled' = notebookId IS NULL
  // WP-APP-006: optional ?tagId=<id> — notes carrying that tag (AND with other filters)
  // WP-API-001 — cursor pagination and dual contract (temporary):
  //   - No pagination params (no limit, no cursor) → legacy bare array, capped at 100, unchanged.
  //     The app shell consumes this and its E2E asserts the bare-array shape.
  //   - When limit or cursor is present → new object { items, nextCursor, hasMore }.
  //     This is intentional and temporary; a future client WP owns migrating the
  //     app shell to the paginated shape everywhere. Documented in PROJECT_BIBLE.md.
  const { filter, trash, trashed, isTrashed: isTrashedQ, q, notebookId: nbParam, tagId: tagParam } = req.query;
  let isTrashed;
  if (filter === 'trash') isTrashed = true;
  else if (filter === 'active') isTrashed = false;
  else if (filter === 'all') isTrashed = undefined;
  else if (trash !== undefined) isTrashed = trash === '1' || trash === 'true';
  else if (trashed !== undefined) isTrashed = trashed === '1' || trashed === 'true';
  else if (isTrashedQ !== undefined) isTrashed = isTrashedQ === '1' || isTrashedQ === 'true';
  else isTrashed = false; // default: All Notes excludes trashed

  // Empty/missing q → same list behavior as today (no search clause)
  const needle = typeof q === 'string' ? q.trim() : '';

  // Notebook filter (omitted = all notebooks; ownership enforced)
  try {
    let nbFilter; // undefined = no notebook filter
    if (nbParam !== undefined && nbParam !== '') {
      const p = String(nbParam).toLowerCase();
      if (p === 'none' || p === 'unfiled') {
        nbFilter = null;
      } else {
        const nb = await prisma.notebook.findFirst({ where: { id: String(nbParam), userId } });
        if (!nb) return res.status(400).json({ message: 'Unknown notebook' });
        nbFilter = nb.id;
      }
    }

    // WP-APP-006 — tag filter (omitted = any tags; ownership enforced)
    let tagFilter; // undefined = no tag filter
    if (tagParam !== undefined && tagParam !== '') {
      const tg = await prisma.tag.findFirst({ where: { id: String(tagParam), userId } });
      if (!tg) return res.status(400).json({ message: 'Unknown tag' });
      tagFilter = tg.id;
    }

    const hasLimit = Object.prototype.hasOwnProperty.call(req.query, 'limit');
    const hasCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const usePagination = hasLimit || hasCursor;

    if (!usePagination) {
      const notes = await prisma.note.findMany({
        where: { userId, ...(isTrashed !== undefined ? { isTrashed } : {}), ...(needle ? { q: needle } : {}), ...(nbFilter !== undefined ? { notebookId: nbFilter } : {}), ...(tagFilter !== undefined ? { tagId: tagFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        limit: 100, // WP-APP-004 result cap — kept for legacy bare-array path
      });
      return res.status(200).json(notes);
    }

    // --- Paginated path (WP-API-001) ---
    // limit: default 20, max 100, clamp non-numeric/<1/>100 to default/max per spec
    let limit = 20;
    if (hasLimit) {
      const raw = String(req.query.limit);
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) {
        limit = 20; // spec: non-numeric, <1 → clamp to default (do not error)
      } else if (n > 100) {
        limit = 100;
      } else {
        limit = n;
      }
    }

    let cursorObj = null;
    if (hasCursor) {
      const rawCursor = String(req.query.cursor);
      try {
        const decodedStr = Buffer.from(rawCursor, 'base64url').toString('utf-8');
        const parsed = JSON.parse(decodedStr);
        if (!parsed || typeof parsed !== 'object') throw new Error('bad');
        if (parsed.v !== 1) throw new Error('bad version');
        if (typeof parsed.id !== 'string' || !parsed.id) throw new Error('bad id');
        if (typeof parsed.k !== 'string' || !parsed.k) throw new Error('bad k');
        if (parsed.p === undefined) throw new Error('missing p');
        // coerce pinned flag to bool
        cursorObj = { v: 1, p: !!parsed.p, k: parsed.k, id: parsed.id };
      } catch {
        return res.status(400).json({ message: 'Invalid cursor' });
      }
    }

    const fetchLimit = limit + 1; // hasMore via limit+1, no COUNT(*)
    const notes = await prisma.note.findMany({
      where: { userId, ...(isTrashed !== undefined ? { isTrashed } : {}), ...(needle ? { q: needle } : {}), ...(nbFilter !== undefined ? { notebookId: nbFilter } : {}), ...(tagFilter !== undefined ? { tagId: tagFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      limit: fetchLimit,
      cursor: cursorObj,
    });

    const hasMore = notes.length > limit;
    const items = hasMore ? notes.slice(0, limit) : notes;
    let nextCursor = null;
    if (hasMore && items.length) {
      const last = items[items.length - 1];
      try {
        const payload = { v: 1, p: !!last.isPinned, k: last.createdAt, id: last.id };
        nextCursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
      } catch {
        nextCursor = null;
      }
    }

    return res.status(200).json({ items, nextCursor, hasMore });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to fetch notes' });
  }
};

export const updateNote = async (req, res) => {
  const { id } = req.params;
  const { title, description, contentJson, contentText, isTrashed, trashedAt, notebookId, tagIds, isPinned } = req.body;
  const userId = req.userId;

  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });

    if (!existing) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const data = {};
    if (title !== undefined) data.title = title || 'Untitled';
    if (contentJson !== undefined) data.contentJson = contentJson;
    if (contentText !== undefined) {
      data.contentText = String(contentText);
      if (description === undefined) data.description = String(contentText);
    }
    if (description !== undefined) data.description = String(description);
    if (isTrashed !== undefined) {
      data.isTrashed = !!isTrashed;
      data.trashedAt = data.isTrashed ? (trashedAt || new Date().toISOString()) : null;
    } else if (trashedAt !== undefined) {
      data.trashedAt = trashedAt;
    }
    // WP-APP-005: notebookId may be set ('' / null = move to unfiled)
    if (notebookId !== undefined) {
      if (notebookId === null || notebookId === '') {
        data.notebookId = null;
      } else {
        const nb = await prisma.notebook.findFirst({ where: { id: String(notebookId), userId } });
        if (!nb) return res.status(400).json({ message: 'Unknown notebook' });
        data.notebookId = nb.id;
      }
    }
    // WP-APP-006: tagIds replace-set (string[] — replaces the note's whole tag set; [] clears).
    // Every id must belong to the user → 400 otherwise.
    if (tagIds !== undefined) {
      if (!Array.isArray(tagIds) || tagIds.some(t => typeof t !== 'string' || !t)) {
        return res.status(400).json({ message: 'tagIds must be an array of tag id strings' });
      }
      const unique = [...new Set(tagIds)];
      const owned = await prisma.tag.findManyByIds(userId, unique);
      if (owned.length !== unique.length) {
        return res.status(400).json({ message: 'Unknown tag id' });
      }
      data.tagIds = unique;
    }
    // WP-APP-007: pin/unpin — strict boolean; composes with any other fields in one PUT.
    // Pinned notes sort to the top of every list (respecting filter/trash/search scoping).
    if (isPinned !== undefined) {
      if (typeof isPinned !== 'boolean') {
        return res.status(400).json({ message: 'isPinned must be a boolean' });
      }
      data.isPinned = isPinned;
    }

    // If no fields to update, return existing
    if (Object.keys(data).length === 0) {
      return res.status(200).json(existing);
    }

    const updated = await prisma.note.update({
      where: { id },
      data,
    });

    res.status(200).json(updated);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to update note' });
  }
};

// POST /api/notes/:id/trash  { isTrashed: true }
export const trashNote = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Note not found' });
    if (existing.isTrashed) return res.status(200).json(existing);
    const updated = await prisma.note.update({
      where: { id },
      data: { isTrashed: true, trashedAt: new Date().toISOString() },
    });
    res.status(200).json(updated);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to trash note' });
  }
};

// POST /api/notes/:id/restore  { isTrashed: false }
export const restoreNote = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Note not found' });
    if (!existing.isTrashed) return res.status(200).json(existing);
    const updated = await prisma.note.update({
      where: { id },
      data: { isTrashed: false, trashedAt: null },
    });
    res.status(200).json(updated);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to restore note' });
  }
};

export const deleteNote = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });

    if (!existing) {
      return res.status(404).json({ message: 'Note not found' });
    }
    // Only allow permanent delete when already trashed
    if (!existing.isTrashed) {
      return res.status(400).json({ message: 'Move to Trash first. Delete forever only allowed for trashed notes.' });
    }

    // Share metadata and local images are retained while trashed/restored, and
    // removed only when the owning note is permanently deleted (explicit for SQLite FK-off mode).
    await prisma.query(`DELETE FROM "NoteShare" WHERE "noteId" = $1 AND "userId" = $2`, [id, userId]);
    await deleteAttachmentsForNote(id, userId);
    await prisma.note.delete({ where: { id } });
    res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to delete note' });
  }
};
