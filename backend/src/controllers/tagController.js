import prisma from '../config/db.js';
import { logError } from '../lib/logging.js';

// WP-APP-006 — Tags (minimal): list / create / delete (deleting detaches from notes; notes are kept)
// How tags are set on notes: PUT/PATCH /api/notes/:id accepts { tagIds: string[] } — an ATOMIC
// REPLACE-SET of that note's tags ([] clears). Ownership of every tag id is validated → 400.

const NAME_MAX = 50;

function cleanName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

// GET /api/tags — user's tags with non-trashed note counts
// WP-API-001 — counts now come from a single grouped LEFT JOIN in db.js, not per-row correlated subquery nor loop
export const getTags = async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({ where: { userId: req.userId } });
    res.status(200).json(tags);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
};

// POST /api/tags { name } → 201 | 400 | 409 (case-insensitive duplicate per user)
export const createTag = async (req, res) => {
  const userId = req.userId;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: 'Tag name is required' });
  if (name.length > NAME_MAX) return res.status(400).json({ message: `Tag name too long (max ${NAME_MAX} chars)` });

  try {
    const dup = await prisma.tag.findByName(userId, name);
    if (dup) return res.status(409).json({ message: 'A tag with this name already exists' });
    const tag = await prisma.tag.create({ data: { name, userId } });
    res.status(201).json({ ...tag, noteCount: 0 });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Failed to create tag' });
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
    logError(req, error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
};
