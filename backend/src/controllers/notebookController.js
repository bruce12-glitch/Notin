import prisma from '../config/db.js';
import { notebookSchema, validateBody } from '../lib/validation.js';
import { sendInternalError } from '../lib/apiResponse.js';

// WP-APP-005 — Notebooks (minimal): create / list / rename / delete (notes unfied, never deleted)
// WP-HARDEN-001 — name validation is centralized in lib/validation.js; the
// duplicate-name 409 contract is unchanged.

// GET /api/notebooks — list user's notebooks (with non-trashed note counts)
export const getNotebooks = async (req, res) => {
  try {
    const notebooks = await prisma.notebook.findMany({ where: { userId: req.userId } });
    res.status(200).json(notebooks);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to fetch notebooks', 'getNotebooks');
  }
};

// POST /api/notebooks { name }
export const createNotebook = async (req, res) => {
  const userId = req.userId;
  const body = validateBody(notebookSchema, req, res);
  if (!body) return;

  try {
    const name = body.name;
    const dup = await prisma.notebook.findByName(userId, name);
    if (dup) return res.status(409).json({ message: 'A notebook with this name already exists' });
    const notebook = await prisma.notebook.create({ data: { name, userId } });
    res.status(201).json({ ...notebook, noteCount: 0 });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to create notebook', 'createNotebook');
  }
};

// PATCH /api/notebooks/:id { name }  (rename)
export const updateNotebook = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const body = validateBody(notebookSchema, req, res);
  if (!body) return;

  try {
    const name = body.name;
    const existing = await prisma.notebook.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Notebook not found' });

    const dup = await prisma.notebook.findByName(userId, name);
    if (dup && dup.id !== id) return res.status(409).json({ message: 'A notebook with this name already exists' });

    const updated = await prisma.notebook.update({ where: { id }, data: { name } });
    res.status(200).json(updated);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to update notebook', 'updateNotebook');
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
    return sendInternalError(req, res, error, 'Failed to delete notebook', 'deleteNotebook');
  }
};
