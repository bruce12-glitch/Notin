import prisma from '../config/db.js';

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
    console.error(error);
    res.status(500).json({ message: 'Failed to create note' });
  }
};

export const getNotes = async (req, res) => {
  const userId = req.userId;
  // Support ?filter=active|trash|all and legacy ?trash=0|1, ?isTrashed, ?trashed
  // WP-APP-004: optional ?q=<string> — full-text search (title / contentText / description)
  // WP-APP-005: optional ?notebookId=<id|none> — 'none'/'unfiled' = notebookId IS NULL
  // WP-APP-006: optional ?tagId=<id> — notes carrying that tag (AND with other filters)
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

    const notes = await prisma.note.findMany({
      where: { userId, ...(isTrashed !== undefined ? { isTrashed } : {}), ...(needle ? { q: needle } : {}), ...(nbFilter !== undefined ? { notebookId: nbFilter } : {}), ...(tagFilter !== undefined ? { tagId: tagFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      limit: 100, // WP-APP-004 result cap
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error(error);
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
    console.error(error);
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
    console.error(error);
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
    console.error(error);
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

    await prisma.note.delete({ where: { id } });
    res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete note' });
  }
};
