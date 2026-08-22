import prisma from '../config/db.js';
import { deleteAttachmentsForNote } from './attachmentController.js';
import { logError } from '../lib/logging.js';
import {
  noteCreateSchema,
  noteUpdateSchema,
  validateBody,
  NOTE_QUERY_MAX,
} from '../lib/validation.js';
import { sendValidationError, sendInternalError } from '../lib/apiResponse.js';

const DEFAULT_LIMIT = 100;
const configuredNoteQuota = Number.parseInt(process.env.MAX_NOTES_PER_USER || '5000', 10);
const MAX_NOTES_PER_USER = Number.isSafeInteger(configuredNoteQuota) && configuredNoteQuota > 0
  ? configuredNoteQuota
  : 5000;

// WP-HARDEN-001 — pagination query parsing for GET /api/notes.
// Returns null after sending a 400 when any argument is invalid.
function parsePagination(query, res) {
  const { page, limit, includeMeta, includeRank, q } = query;
  const details = [];

  const pageNum = page === undefined ? 1 : parsePositiveInt(page, 'page', details);
  const limitNum = limit === undefined ? DEFAULT_LIMIT : parseBoundedInt(limit, 'limit', 1, DEFAULT_LIMIT, details);
  const metaRequested = includeMeta === 'true';
  const rankRequested = includeRank === 'true';

  if (includeMeta !== undefined && includeMeta !== 'true') {
    details.push({ field: 'includeMeta', message: 'includeMeta must be "true"' });
  }
  if (includeRank !== undefined && includeRank !== 'true') {
    details.push({ field: 'includeRank', message: 'includeRank must be "true"' });
  }
  if (rankRequested) {
    const needle = typeof q === 'string' ? q.trim() : '';
    if (!needle) {
      details.push({ field: 'includeRank', message: 'includeRank requires a search query (?q=)' });
    } else if (!prisma.usePostgres) {
      details.push({ field: 'includeRank', message: 'includeRank is only available on the PostgreSQL search path' });
    }
  }

  if (details.length) {
    sendValidationError(res, details);
    return null;
  }
  return { pageNum, limitNum, metaRequested, rankRequested };
}

function parsePositiveInt(raw, field, details) {
  const value = String(raw);
  if (!/^[1-9]\d*$/.test(value)) {
    details.push({ field, message: `${field} must be a positive integer` });
    return 1;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num)) {
    details.push({ field, message: `${field} must be a positive integer` });
    return 1;
  }
  return num;
}

function parseBoundedInt(raw, field, min, max, details) {
  const value = String(raw);
  if (!/^\d+$/.test(value)) {
    details.push({ field, message: `${field} must be an integer between ${min} and ${max}` });
    return max;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    details.push({ field, message: `${field} must be an integer between ${min} and ${max}` });
    return max;
  }
  return num;
}

export const createNote = async (req, res) => {
  const userId = req.userId;

  const body = validateBody(noteCreateSchema, req, res);
  if (!body) return;

  try {
    const noteCount = await prisma.note.count({ where: { userId } });
    if (noteCount >= MAX_NOTES_PER_USER) {
      return res.status(403).json({
        message: `Note limit reached (${MAX_NOTES_PER_USER})`,
        code: 'NOTE_QUOTA_REACHED',
      });
    }

    // WP-APP-005: optional notebook assignment on create (ownership-checked)
    let nbId = null;
    if (body.notebookId !== undefined && body.notebookId !== null && body.notebookId !== '') {
      const nb = await prisma.notebook.findFirst({ where: { id: String(body.notebookId), userId } });
      if (!nb) return res.status(400).json({ message: 'Unknown notebook' });
      nbId = nb.id;
    }
    const note = await prisma.note.create({
      data: {
        title: body.title || 'Untitled',
        description: body.description || body.contentText || '',
        contentJson: body.contentJson,
        contentText: body.contentText || body.description || '',
        notebookId: nbId,
        userId,
      },
    });
    res.status(201).json(note);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to create note', 'createNote');
  }
};

export const getNotes = async (req, res) => {
  const userId = req.userId;
  // Support ?filter=active|trash|all and legacy ?trash=0|1, ?isTrashed, ?trashed
  // WP-APP-004: optional ?q=<string> — full-text search (title / contentText / description)
  // WP-APP-005: optional ?notebookId=<id|none> — 'none'/'unfiled' = notebookId IS NULL
  // WP-APP-006: optional ?tagId=<id> — notes carrying that tag (AND with other filters)
  // WP-HARDEN-001: optional page / limit / includeMeta / includeRank
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

  // WP-HARDEN-001 — query-length cap keeps tsquery parsing and LIKE scanning
  // bounded (defense in depth on top of the parameterized statements).
  if (needle.length > NOTE_QUERY_MAX) {
    return sendValidationError(res, [
      { field: 'q', message: `Search query must be ${NOTE_QUERY_MAX} characters or fewer` },
    ]);
  }

  const pagination = parsePagination(req.query, res);
  if (!pagination) return;
  const { pageNum, limitNum, metaRequested, rankRequested } = pagination;

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

    const where = {
      userId,
      ...(isTrashed !== undefined ? { isTrashed } : {}),
      ...(needle ? { q: needle } : {}),
      ...(nbFilter !== undefined ? { notebookId: nbFilter } : {}),
      ...(tagFilter !== undefined ? { tagId: tagFilter } : {}),
    };

    const notes = await prisma.note.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      includeRank: rankRequested,
    });

    // WP-HARDEN-001 — pagination metadata (only when explicitly requested).
    if (metaRequested) {
      const total = await prisma.note.count({ where });
      return res.status(200).json({
        items: notes,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }
    res.status(200).json(notes);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to fetch notes', 'getNotes');
  }
};

export const updateNote = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const body = validateBody(noteUpdateSchema, req, res);
  if (!body) return;

  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });

    if (!existing) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const data = {};
    if (body.title !== undefined) data.title = body.title || 'Untitled';
    if (body.contentJson !== undefined) data.contentJson = body.contentJson;
    if (body.contentText !== undefined) {
      data.contentText = String(body.contentText);
      if (body.description === undefined) data.description = String(body.contentText);
    }
    if (body.description !== undefined) data.description = String(body.description);
    if (body.isTrashed !== undefined) {
      data.isTrashed = !!body.isTrashed;
      // WP-HARDEN-001 — server timestamps are authoritative; the client can
      // never supply trashedAt.
      data.trashedAt = data.isTrashed ? new Date().toISOString() : null;
    }
    // WP-APP-005: notebookId may be set ('' / null = move to unfiled)
    if (body.notebookId !== undefined) {
      if (body.notebookId === null || body.notebookId === '') {
        data.notebookId = null;
      } else {
        const nb = await prisma.notebook.findFirst({ where: { id: String(body.notebookId), userId } });
        if (!nb) return res.status(400).json({ message: 'Unknown notebook' });
        data.notebookId = nb.id;
      }
    }
    // WP-APP-006: tagIds replace-set (string[] — replaces the note's whole tag set; [] clears).
    // Every id must belong to the user → 400 otherwise.
    if (body.tagIds !== undefined) {
      const unique = [...new Set(body.tagIds)];
      const owned = await prisma.tag.findManyByIds(userId, unique);
      if (owned.length !== unique.length) {
        return res.status(400).json({ message: 'Unknown tag id' });
      }
      data.tagIds = unique;
    }
    // WP-APP-007: pin/unpin — strict boolean; composes with any other fields in one PUT.
    if (body.isPinned !== undefined) {
      data.isPinned = body.isPinned;
    }

    // If no fields to update, return existing
    if (Object.keys(data).length === 0) {
      return res.status(200).json(existing);
    }
    if (body.expectedUpdatedAt !== undefined) data.expectedUpdatedAt = body.expectedUpdatedAt;

    const updated = await prisma.note.update({
      where: { id },
      data,
    });

    if (!updated && body.expectedUpdatedAt !== undefined) {
      return res.status(409).json({
        message: 'This note changed in another session. Reload it before saving again.',
        code: 'NOTE_CONFLICT',
      });
    }
    res.status(200).json(updated);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to update note', 'updateNote');
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
    return sendInternalError(req, res, error, 'Failed to trash note', 'trashNote');
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
    return sendInternalError(req, res, error, 'Failed to restore note', 'restoreNote');
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
    return sendInternalError(req, res, error, 'Failed to delete note', 'deleteNote');
  }
};
