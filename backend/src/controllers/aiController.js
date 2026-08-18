import db from '../config/db.js';
import {
  summarizeText,
  suggestTitle,
  suggestTags,
  chatWithNote,
  chatWithNoteStream,
  assistWrite,
} from '../lib/ai/provider.js';
import {
  MAX_CHAT_QUESTION_CHARS,
  ASSIST_ACTIONS,
  MAX_ASSIST_CONTEXT_CHARS,
  MAX_ASSIST_INPUT_CHARS,
  MIN_ASSIST_NOTE_CHARS,
} from '../lib/ai/prompts.js';

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
    // Guard order mirrors the sibling AI handlers: ownership first, so a
    // non-owner can never distinguish a bad request from a missing note.
    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before chatting' });

    const rawQuestion = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!rawQuestion || rawQuestion.length > MAX_CHAT_QUESTION_CHARS) {
      return res.status(400).json({ message: 'Ask a question (1–500 characters)' });
    }

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

// ── WP-AI-003b — streaming chat (SSE deltas; still zero persistence) ─────────
export async function chatWithNoteStreamController(req, res) {
  // Client-disconnect signal for the write loop. Deliberately `res` 'close',
  // not `req` 'close': on Node ≥16 the request stream's 'close' fires as soon
  // as the request body has been consumed, which would cut every stream
  // immediately. The response's 'close' fires when the connection actually
  // goes away (and once more after a normal end, when we are already done).
  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
  });

  try {
    // Guard block duplicated from chatWithNoteController on purpose so the
    // JSON endpoint's outward behavior stays byte-identical — same order,
    // same messages, same statuses. All of these answers are plain JSON:
    // guards run before the SSE upgrade.
    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before chatting' });

    const rawQuestion = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!rawQuestion || rawQuestion.length > MAX_CHAT_QUESTION_CHARS) {
      return res.status(400).json({ message: 'Ask a question (1–500 characters)' });
    }

    const contentText = typeof note.contentText === 'string' ? note.contentText : '';
    const description = typeof note.description === 'string' ? note.description : '';
    const sourceText = (contentText.trim() ? contentText : description).trim();
    if (sourceText.length < 40) {
      return res.status(400).json({ message: 'Note is too short to chat about (needs at least 40 characters)' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Deliberate: nothing is written anywhere — no note UPDATE, no transcript
    // rows. Deltas go straight to the wire; history stays client-side only.
    const { stream } = await chatWithNoteStream(sourceText, rawQuestion, req.body?.history);
    for await (const delta of stream) {
      if (clientGone) break; // abandoned client — stop before writing again
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
    if (!clientGone) res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      // Failure before the upgrade: the exact JSON error family the
      // non-streaming endpoint uses.
      if (error?.message === 'AI_PROVIDER_ERROR') {
        return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Could not answer that question' });
    }
    // Failure mid-stream: in-band error frame + [DONE], never res.status()
    // after headers. Expected provider failures stay silent; anything else
    // gets one console.error. No content is ever logged.
    if (error?.message !== 'AI_PROVIDER_ERROR') console.error(error);
    if (!clientGone) {
      res.write(`data: ${JSON.stringify({ error: 'AI is busy right now — try again in a moment' })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
    res.end();
  }
}

// ── WP-AI-004 — writing assistant (suggestion only; server never writes) ─────
export async function assistNoteController(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, title, "contentText", description, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.id, req.userId],
    );
    const note = rows[0];
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before using AI' });

    const action = req.body?.action;
    if (!ASSIST_ACTIONS.includes(action)) {
      return res.status(400).json({ message: 'Unknown assist action' });
    }

    let sourceText;
    if (action === 'continue') {
      const contentText = typeof note.contentText === 'string' ? note.contentText : '';
      const description = typeof note.description === 'string' ? note.description : '';
      const noteText = (contentText.trim() ? contentText : description).trim();
      if (noteText.length < MIN_ASSIST_NOTE_CHARS) {
        return res.status(400).json({ message: 'Note is too short to continue (needs at least 40 characters)' });
      }
      sourceText = noteText.slice(-MAX_ASSIST_CONTEXT_CHARS);
    } else {
      const selection = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!selection || selection.length > MAX_ASSIST_INPUT_CHARS) {
        return res.status(400).json({ message: 'Select some text first (1–2000 characters)' });
      }
      sourceText = selection;
    }

    // Deliberate: no UPDATE. The client may apply the suggestion through the
    // editor's existing consent + autosave path.
    const { suggestion, provider } = await assistWrite(action, sourceText);
    return res.status(200).json({ suggestion, action, provider });
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') {
      return res.status(503).json({ message: 'AI is busy right now — try again in a moment' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Could not assist with that text' });
  }
}
