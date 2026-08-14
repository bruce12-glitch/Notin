import db from '../config/db.js';
import { summarizeText } from '../lib/ai/provider.js';

function isTrashed(value) {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

export async function summarizeNote(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before summarizing' });

    const contentText = typeof note.contentText === 'string' ? note.contentText : '';
    const description = typeof note.description === 'string' ? note.description : '';
    const sourceText = contentText.trim() ? contentText : description;
    if (sourceText.trim().length < 200) {
      return res.status(400).json({ message: 'Note is too short to summarize (needs at least 200 characters)' });
    }

    const { summary, provider } = await summarizeText(sourceText);
    await db.query(
      `UPDATE "Note" SET summary = $1, "updatedAt" = $2 WHERE id = $3 AND "userId" = $4`,
      [summary, new Date().toISOString(), req.params.id, req.userId],
    );
    return res.status(200).json({ summary, provider });
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') {
      return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Could not summarize this note' });
  }
}
