import prisma from '../config/db.js';
import { tagSchema, validateBody } from '../lib/validation.js';
import { sendInternalError } from '../lib/apiResponse.js';

// WP-APP-006 — Tags (minimal): list / create / delete (deleting detaches from notes; notes are kept)
// How tags are set on notes: PUT/PATCH /api/notes/:id accepts { tagIds: string[] } — an ATOMIC
// REPLACE-SET of that note's tags ([] clears). Ownership of every tag id is validated → 400.
// WP-HARDEN-001 — name validation is centralized in lib/validation.js; the
// duplicate-name 409 contract is unchanged.

// GET /api/tags — user's tags with non-trashed note counts
export const getTags = async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({ where: { userId: req.userId } });
    res.status(200).json(tags);
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to fetch tags', 'getTags');
  }
};

// POST /api/tags { name } → 201 | 400 | 409 (case-insensitive duplicate per user)
export const createTag = async (req, res) => {
  const userId = req.userId;
  const body = validateBody(tagSchema, req, res);
  if (!body) return;

  try {
    const name = body.name;
    const dup = await prisma.tag.findByName(userId, name);
    if (dup) return res.status(409).json({ message: 'A tag with this name already exists' });
    const tag = await prisma.tag.create({ data: { name, userId } });
    res.status(201).json({ ...tag, noteCount: 0 });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to create tag', 'createTag');
  }
};

// DELETE /api/tags/:id — detach from all notes, then delete; the notes themselves are kept
export const deleteTag = async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    const existing = await prisma.tag.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: 'Tag not found' });

    const detached = await prisma.tag.detachFromNotes(id);
    await prisma.tag.delete({ where: { id } });
    res.status(200).json({ message: 'Tag deleted. Notes were kept (tag removed from them).', detachedNotes: detached });
  } catch (error) {
    return sendInternalError(req, res, error, 'Failed to delete tag', 'deleteTag');
  }
};
