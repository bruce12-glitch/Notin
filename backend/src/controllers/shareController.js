import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import db from '../config/db.js';
import { uploadDir } from './attachmentController.js';
import { logError } from '../lib/logging.js';
import { canonicalOrigin } from '../lib/httpSecurity.js';

const TOKEN_BYTES = 32;
const configuredShareTtlDays = Number.parseInt(process.env.SHARE_TTL_DAYS || '30', 10);
const SHARE_TTL_DAYS = Number.isSafeInteger(configuredShareTtlDays) && configuredShareTtlDays >= 0
  ? configuredShareTtlDays
  : 30;
const configuredPublicAppOrigin = process.env.PUBLIC_APP_URL
  ? String(process.env.PUBLIC_APP_URL).replace(/\/+$/, '')
  : null;

function publicAppOrigin(req) {
  if (configuredPublicAppOrigin) return configuredPublicAppOrigin;
  if (process.env.NODE_ENV === 'production') return String(canonicalOrigin).replace(/\/+$/, '');
  // Development convenience only. Production never trusts request host headers.
  return `${req.protocol}://${req.get('host')}`;
}
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const isTrashed = (value) => value === true || value === 1 || value === '1' || value === 't';

async function ownedNote(noteId, userId) {
  const { rows } = await db.query(
    `SELECT id, title, "contentJson", "contentText", description, "isTrashed"
     FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
    [noteId, userId],
  );
  return rows[0] || null;
}

export async function createShare(req, res) {
  try {
    const note = await ownedNote(req.params.id, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (isTrashed(note.isTrashed)) return res.status(400).json({ message: 'Restore the note before sharing it' });

    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const expiresAt = SHARE_TTL_DAYS === 0
      ? null
      : new Date(Date.now() + SHARE_TTL_DAYS * 86400000).toISOString();
    const shareId = `shr_${crypto.randomUUID()}`;

    // One share per note. Creating again rotates the secret and invalidates the old URL.
    await db.query(`DELETE FROM "NoteShare" WHERE "noteId" = $1 AND "userId" = $2`, [note.id, req.userId]);
    await db.query(
      `INSERT INTO "NoteShare" (id, "noteId", "userId", "tokenHash", "shareEnabled", "createdAt", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [shareId, note.id, req.userId, tokenHash, db.usePostgres ? true : 1, now, expiresAt],
    );

    // Never derive secret-bearing links from Host/X-Forwarded-Host headers.
    const url = `${publicAppOrigin(req)}/share.html?token=${encodeURIComponent(token)}`;
    res.status(201).json({ url, token, expiresAt });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Could not create share link' });
  }
}

export async function revokeShare(req, res) {
  try {
    const note = await ownedNote(req.params.id, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    await db.query(
      `UPDATE "NoteShare" SET "shareEnabled" = $1 WHERE "noteId" = $2 AND "userId" = $3`,
      [db.usePostgres ? false : 0, note.id, req.userId],
    );
    res.status(204).end();
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Could not revoke share link' });
  }
}

async function resolvePublicShare(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 200) return null;
  const { rows } = await db.query(
    `SELECT ns.id AS "shareId", ns."noteId", n.title, n."contentJson", n."contentText", n.description
     FROM "NoteShare" ns
     JOIN "Note" n ON n.id = ns."noteId"
     WHERE ns."tokenHash" = $1
       AND LOWER(CAST(ns."shareEnabled" AS TEXT)) IN ('true', '1', 't')
       AND LOWER(CAST(n."isTrashed" AS TEXT)) IN ('false', '0', 'f')
       AND (ns."expiresAt" IS NULL OR ns."expiresAt" > $2)
     LIMIT 1`,
    [hashToken(token), new Date().toISOString()],
  );
  return rows[0] || null;
}

export async function getPublicShare(req, res) {
  try {
    const share = await resolvePublicShare(req.params.token);
    if (!share) return res.status(404).json({ message: 'Shared note not found' });
    const { rows: images } = await db.query(
      `SELECT id, filename, mime, size, "createdAt" FROM "Attachment"
       WHERE "noteId" = $1 ORDER BY "createdAt" ASC`,
      [share.noteId],
    );
    const encodedToken = encodeURIComponent(req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      title: share.title,
      contentJson: share.contentJson,
      contentText: share.contentText || share.description || '',
      images: images.map((image) => ({
        id: image.id,
        filename: image.filename,
        mime: image.mime,
        size: Number(image.size),
        url: `/api/public/share/${encodedToken}/files/${encodeURIComponent(image.id)}`,
      })),
    });
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Could not load shared note' });
  }
}

export async function getPublicShareFile(req, res) {
  try {
    const share = await resolvePublicShare(req.params.token);
    if (!share) return res.status(404).json({ message: 'Shared image not found' });
    const { rows } = await db.query(
      `SELECT id, filename, mime, path FROM "Attachment" WHERE id = $1 AND "noteId" = $2 LIMIT 1`,
      [req.params.attachmentId, share.noteId],
    );
    const attachment = rows[0];
    if (!attachment) return res.status(404).json({ message: 'Shared image not found' });
    const filePath = path.join(uploadDir, path.basename(attachment.path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Shared image not found' });
    res.type(attachment.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(filePath);
  } catch (error) {
    logError(req, error);
    res.status(500).json({ message: 'Could not load shared image' });
  }
}
