import prisma from '../config/db.js';

export const createNote = async (req, res) => {
  const { title, description } = req.body;
  const userId = req.userId;

  try {
    const note = await prisma.note.create({
      data: { title, description, userId },
    });
    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create note' });
  }
};

export const getNotes = async (req, res) => {
  const userId = req.userId;

  try {
    const notes = await prisma.note.findMany({
      where: { userId },
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
  const { title, description } = req.body;
  const userId = req.userId;

  try {
    const existing = await prisma.note.findFirst({ where: { id, userId } });

    if (!existing) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const updated = await prisma.note.update({
      where: { id },
      data: { title, description },
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update note' });
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

    await prisma.note.delete({ where: { id } });
    res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete note' });
  }
};