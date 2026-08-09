import prisma from '../config/db.js';

export const createNote = async (req, res) => {
  const { title, description, contentJson, contentText } = req.body;
  const userId = req.userId;

  try {
    const note = await prisma.note.create({
      data: { title: title || 'Untitled', description: description || contentText || '', contentJson, contentText: contentText || description || '', userId },
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
  const { filter, trash, trashed, isTrashed: isTrashedQ } = req.query;
  let isTrashed;
  if (filter === 'trash') isTrashed = true;
  else if (filter === 'active') isTrashed = false;
  else if (filter === 'all') isTrashed = undefined;
  else if (trash !== undefined) isTrashed = trash === '1' || trash === 'true';
  else if (trashed !== undefined) isTrashed = trashed === '1' || trashed === 'true';
  else if (isTrashedQ !== undefined) isTrashed = isTrashedQ === '1' || isTrashedQ === 'true';
  else isTrashed = false; // default: All Notes excludes trashed

  try {
    const notes = await prisma.note.findMany({
      where: { userId, ...(isTrashed !== undefined ? { isTrashed } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch notes' });
  }
};

export const updateNote = async (req, res) => {
  const { id } = req.params;
  const { title, description, contentJson, contentText, isTrashed, trashedAt } = req.body;
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
