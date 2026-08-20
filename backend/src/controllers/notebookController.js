import prisma from '../config/db.js';
import { logError } from '../lib/logging.js';

// WP-APP-005 — Notebooks (minimal): create / list / rename / delete (notes unfied, never deleted)

const NAME_MAX = 100;

function cleanName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

// GET /api/notebooks — list user's notebooks (with non-trashed note counts)
// WP-API-001 — counts now come from a single grouped LEFT JOIN in db.js, not per-row correlated subquery nor loop
export const getNotebooks = async (req, res) => {
  try {
    const notebooks = await prisma.notebook.findMany({ where: { userId: req.userId } });
    res.status(200).json(notebooks);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to fetch notebooks' });
  }
};

// POST /api/notebooks { name }
export const createNotebook = async (req, res) => {
  const userId = req.userId;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: 'Notebook name is required' });
  if (name.length > NAME_MAX) return res.status(400).json({ message: `Notebook name too long (max ${NAME_MAX} chars)` });

  try {
    const dup = await prisma.notebook.findByName(userId, name);
    if (dup) return res.status(409).json({ message: 'A notebook with this name already exists' });
    const notebook = await prisma.notebook.create({ data: { name, userId } });
    res.status(201).json({ ...notebook, noteCount: 0 });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to create notebook' });
  }
};

// PATCH /api/notebooks/:id { name }  (rename)
export const updateNotebook = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: 'Notebook name is required' });
  if (name.length > NAME_MAX) return res.status(400).json({ message: `Notebook name too long (max ${NAME_MAX} chars)` });

  try {
    const existing = await prisma.notebook.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Notebook not found' });

    const dup = await prisma.notebook.findByName(userId, name);
    if (dup && dup.id !== id) return res.status(409).json({ message: 'A notebook with this name already exists' });

    const updated = await prisma.notebook.update({ where: { id }, data: { name } });
    res.status(200).json(updated);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to update notebook' });
  }
};

// DELETE /api/notebooks/:id — notes become unfiled (notebookId = NULL), never deleted
export const deleteNotebook = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    const existing = await prisma.notebook.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Notebook not found' });

    const unfiled = await prisma.notebook.unfileNotes(id);
    await prisma.notebook.delete({ where: { id } });
    res.status(200).json({ message: 'Notebook deleted. Its notes were kept and are now unfiled.', unfiledNotes: unfiled });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to delete notebook' });
  }
};
