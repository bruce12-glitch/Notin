import fs from 'node:fs';
import path from 'node:path';
import db from '../config/db.js';
import { uploadDir } from './attachmentController.js';
import { logError } from '../lib/logging.js';
import { entitlementsForPlan } from '../lib/billing.js';

const isTrue = (value) => value === true || value === 1 || value === '1' || value === 't';

function parseContentJson(value) {
  if (!value || typeof value !== 'string') return value || null;
  try { return JSON.parse(value); } catch { return value; }
}

function clearSessionCookies(res) {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
  res.clearCookie('notin_refresh', { ...common, path: '/api/auth' });
  res.clearCookie('notin_refresh', { ...common, path: '/auth' });
  res.clearCookie('notin_csrf', { ...common, httpOnly: false, path: '/' });
}

export async function getUsage(req, res) {
  try {
    const userId = req.userId;
    const [noteCountRes, attachmentRes, notebookRes, tagRes, sessionRes, userRes] = await Promise.all([
      db.query(`SELECT COUNT(*) as total FROM "Note" WHERE "userId" = $1`, [userId]),
      db.query(`SELECT COUNT(*) as count, COALESCE(SUM(size),0) as bytes FROM "Attachment" WHERE "userId" = $1`, [userId]),
      db.query(`SELECT COUNT(*) as total FROM "Notebook" WHERE "userId" = $1`, [userId]),
      db.query(`SELECT COUNT(*) as total FROM "Tag" WHERE "userId" = $1`, [userId]),
      db.query(`SELECT COUNT(DISTINCT family_id) as total FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [userId]),
      db.user.findById(userId),
    ]);
    // WP-BILLING-001 — quotas follow the caller's plan (free vs pro), so the
    // Account usage panel can never show a number the server doesn't enforce.
    const entitlements = entitlementsForPlan(userRes?.plan, userRes?.planStatus);
    const maxNotes = entitlements.maxNotes;
    const maxStorage = entitlements.storageQuota;
    res.json({
      plan: {
        id: String(userRes?.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free',
        status: userRes?.planStatus || null,
        renewsAt: userRes?.planRenewsAt || null,
      },
      notes: { count: Number(noteCountRes.rows[0]?.total || 0), quota: maxNotes },
      notebooks: { count: Number(notebookRes.rows[0]?.total || 0) },
      tags: { count: Number(tagRes.rows[0]?.total || 0) },
      attachments: { count: Number(attachmentRes.rows[0]?.count || 0), storageBytes: Number(attachmentRes.rows[0]?.bytes || 0), storageQuota: maxStorage },
      sessions: { count: Number(sessionRes.rows[0]?.total || 0) },
    });
  } catch (e) {
    res.status(500).json({ message: 'Could not load usage' });
  }
}

export async function exportAccount(req, res) {
  try {
    const user = await db.user.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const [noteResult, notebookResult, tagResult, noteTagResult, attachmentResult] = await Promise.all([
      db.query(
        `SELECT n.id, n.title, n."contentText", n."contentJson", n.description, n.summary, n."notebookId",
                n."isPinned", n."isTrashed", n."createdAt", n."updatedAt", nb.name AS "notebookName"
         FROM "Note" n LEFT JOIN "Notebook" nb ON nb.id = n."notebookId"
         WHERE n."userId" = $1 ORDER BY n."createdAt" ASC`,
        [req.userId],
      ),
      db.query(`SELECT id, name, "createdAt", "updatedAt" FROM "Notebook" WHERE "userId" = $1 ORDER BY name ASC`, [req.userId]),
      db.query(`SELECT id, name, "createdAt" FROM "Tag" WHERE "userId" = $1 ORDER BY name ASC`, [req.userId]),
      db.query(
        `SELECT nt."noteId", t.id, t.name FROM "NoteTag" nt
         JOIN "Tag" t ON t.id = nt."tagId"
         JOIN "Note" n ON n.id = nt."noteId"
         WHERE n."userId" = $1 ORDER BY t.name ASC`,
        [req.userId],
      ),
      db.query(
        `SELECT id, "noteId", filename, mime, size, "createdAt"
         FROM "Attachment" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
        [req.userId],
      ),
    ]);

    const tagsByNote = new Map();
    for (const row of noteTagResult.rows) {
      if (!tagsByNote.has(row.noteId)) tagsByNote.set(row.noteId, []);
      tagsByNote.get(row.noteId).push({ id: row.id, name: row.name });
    }

    const payload = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        username: user.username || null,
        createdAt: user.createdAt || user.created_at,
      },
      notes: noteResult.rows.map((note) => ({
        id: note.id,
        title: note.title,
        contentText: note.contentText || '',
        contentJson: parseContentJson(note.contentJson),
        description: note.description || '',
        summary: note.summary || null,
        notebookId: note.notebookId || null,
        notebookName: note.notebookName || null,
        isPinned: isTrue(note.isPinned),
        isTrashed: isTrue(note.isTrashed),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        tags: tagsByNote.get(note.id) || [],
      })),
      notebooks: notebookResult.rows.map((notebook) => ({
        id: notebook.id,
        name: notebook.name,
        createdAt: notebook.createdAt,
        updatedAt: notebook.updatedAt,
      })),
      tags: tagResult.rows.map((tag) => ({ id: tag.id, name: tag.name, createdAt: tag.createdAt })),
      attachments: attachmentResult.rows.map((attachment) => ({
        id: attachment.id,
        noteId: attachment.noteId,
        filename: attachment.filename,
        mime: attachment.mime,
        size: Number(attachment.size),
        createdAt: attachment.createdAt,
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="notin-export-${date}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logError(req, error, 'account export failed');
    res.status(500).json({ message: 'Could not export account data' });
  }
}

export async function deleteAccount(req, res) {
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ message: 'Type DELETE to confirm account deletion' });
  }

  try {
    const user = await db.user.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { rows: attachments } = await db.query(
      `SELECT path FROM "Attachment" WHERE "userId" = $1`,
      [req.userId],
    );

    // Remove bytes first. A non-ENOENT filesystem error aborts deletion rather
    // than reporting success while leaving an orphaned user-owned file.
    for (const attachment of attachments) {
      const filePath = path.join(uploadDir, path.basename(attachment.path));
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    await db.$transaction(async (tx) => {
      const userId = req.userId;
      await tx.query(`DELETE FROM "NoteShare" WHERE "userId" = $1`, [userId]);
      await tx.query(`DELETE FROM "Attachment" WHERE "userId" = $1`, [userId]);
      await tx.query(`DELETE FROM "NoteTag" WHERE "noteId" IN (SELECT id FROM "Note" WHERE "userId" = $1)`, [userId]);
      await tx.query(`DELETE FROM "Note" WHERE "userId" = $1`, [userId]);
      await tx.query(`DELETE FROM "Notebook" WHERE "userId" = $1`, [userId]);
      await tx.query(`DELETE FROM "Tag" WHERE "userId" = $1`, [userId]);
      await tx.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [userId]);
      await tx.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
      await tx.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      await tx.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
    });

    clearSessionCookies(res);
    res.status(204).end();
  } catch (error) {
    logError(req, error, 'account deletion failed');
    res.status(500).json({ message: 'Could not delete account' });
  }
}
