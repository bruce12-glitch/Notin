import db from '../config/db.js';
import { summarizeText, suggestTitle, suggestTags, chatWithNote } from '../lib/ai/provider.js';
import { MAX_CHAT_QUESTION_CHARS } from '../lib/ai/prompts.js';

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

// ── WP-AI-002 — AI title suggestion (server NEVER writes the title) ─────────
export async function suggestNoteTitle(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note first' });

    const existingTitle = typeof note.title === 'string' ? note.title.trim() : '';
    if (existingTitle && existingTitle.toLowerCase() !== 'untitled') {
      return res.status(400).json({ message: 'Note already has a title' });
    }

    const contentText = typeof note.contentText === 'string' ? note.contentText : '';
    const description = typeof note.description === 'string' ? note.description : '';
    const sourceText = contentText.trim() ? contentText : description;
    if (sourceText.trim().length < 40) {
      return res.status(400).json({ message: 'Note is too short to title (needs at least 40 characters)' });
    }

    const { title, provider } = await suggestTitle(sourceText);
    // Deliberate: no UPDATE here. The client applies the accepted title through
    // the existing edit/autosave path so renaming always has user consent.
    return res.status(200).json({ title, provider });
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') {
      return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Could not generate a title' });
  }
}

// ── WP-AI-002b — smart tag suggestions (server NEVER writes tags) ───────────
export async function suggestNoteTags(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note first' });

    const contentText = typeof note.contentText === 'string' ? note.contentText : '';
    const description = typeof note.description === 'string' ? note.description : '';
    const sourceText = (contentText.trim() ? contentText : description).trim();
    if (sourceText.length < 100) {
      return res.status(400).json({ message: 'Note is too short to tag (needs at least 100 characters)' });
    }

    const { rows: existingRows } = await db.query(
      `SELECT id, name FROM "Tag" WHERE "userId" = $1 ORDER BY name`,
      [req.userId],
    );
    const existingNames = existingRows.map((tag) => tag.name);
    const existingByName = new Map(
      existingRows.map((tag) => [String(tag.name).trim().toLowerCase(), tag.id]),
    );
    const { tags, provider } = await suggestTags(sourceText, existingNames);

    // Deliberate: no INSERT/UPDATE here. The client applies one accepted tag at
    // a time through the existing POST /api/tags + PUT { tagIds } write paths.
    return res.status(200).json({
      tags: tags.map((name) => ({
        name,
        existing: existingByName.get(name.toLowerCase()) || null,
      })),
      provider,
    });
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') {
      return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Could not suggest tags' });
  }
}

// ── WP-AI-003 — chat with note (read-only: no note UPDATE, no chat row) ─────
export async function chatWithNoteController(req, res) {
  try {
    const rawQuestion = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!rawQuestion || rawQuestion.length > MAX_CHAT_QUESTION_CHARS) {
      return res.status(400).json({ message: 'Ask a question (1–500 characters)' });
    }

    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before chatting' });

    const contentText = typeof note.contentText === 'string' ? note.contentText : '';
    const description = typeof note.description === 'string' ? note.description : '';
    const sourceText = (contentText.trim() ? contentText : description).trim();
    if (sourceText.length < 40) {
      return res.status(400).json({ message: 'Note is too short to chat about (needs at least 40 characters)' });
    }

    // Deliberate: nothing is written here. The transcript lives only in the
    // caller's tab for the session — no note UPDATE, no chat table.
    const { answer, provider } = await chatWithNote(sourceText, rawQuestion, req.body?.history);
    return res.status(200).json({ answer, provider });
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') {
      return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Could not answer that question' });
  }
}
