import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_NOTE = 10;
const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const extensionByMime = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${extensionByMime[file.mimetype] || ''}`),
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_NOTE },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'images'));
    cb(null, true);
  },
}).array('images', MAX_IMAGES_PER_NOTE);

function publicAttachment(row) {
  return {
    id: row.id,
    noteId: row.noteId,
    filename: row.filename,
    mime: row.mime,
    size: Number(row.size),
    url: `/api/attachments/${row.id}/file`,
    createdAt: row.createdAt,
  };
}

async function ownedNote(noteId, userId) {
  const { rows } = await db.query(
    `SELECT id, "isTrashed" FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
    [noteId, userId],
  );
  return rows[0] || null;
}

async function removeFiles(files = []) {
  await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

export async function ensureAttachmentCapacity(req, res, next) {
  try {
    const note = await ownedNote(req.params.noteId, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const trashed = note.isTrashed === true || note.isTrashed === 1 || note.isTrashed === '1' || note.isTrashed === 't';
    if (trashed) return res.status(400).json({ message: 'Restore the note before attaching images' });
    const { rows } = await db.query(
      `SELECT COUNT(*) AS count FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`,
      [note.id, req.userId],
    );
    req.attachmentCount = Number(rows[0]?.count || 0);
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not prepare image upload' });
  }
}

export async function uploadImages(req, res) {
  const files = req.files || [];
  const createdIds = [];
  try {
    if (!files.length) return res.status(400).json({ message: 'Choose at least one PNG, JPEG, WebP, or GIF image' });
    if ((req.attachmentCount || 0) + files.length > MAX_IMAGES_PER_NOTE) {
      await removeFiles(files);
      return res.status(400).json({ message: `A note can have at most ${MAX_IMAGES_PER_NOTE} images` });
    }

    const created = [];
    for (const file of files) {
      const id = `att_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const originalName = path.basename(file.originalname || 'image').slice(0, 255);
      const { rows } = await db.query(
        `INSERT INTO "Attachment" (id, "noteId", "userId", filename, mime, size, path, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, "noteId", "userId", filename, mime, size, path, "createdAt"`,
        [id, req.params.noteId, req.userId, originalName, file.mimetype, file.size, file.filename, now],
      );
      createdIds.push(id);
      created.push(publicAttachment(rows[0]));
    }
    res.status(201).json(created);
  } catch (error) {
    for (const id of createdIds) await db.query(`DELETE FROM "Attachment" WHERE id = $1`, [id]).catch(() => {});
    await removeFiles(files);
    console.error(error);
    res.status(500).json({ message: 'Image upload failed' });
  }
}

export async function listAttachments(req, res) {
  try {
    const note = await ownedNote(req.params.noteId, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const { rows } = await db.query(
      `SELECT id, "noteId", "userId", filename, mime, size, path, "createdAt"
       FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2 ORDER BY "createdAt" ASC`,
      [note.id, req.userId],
    );
    res.json(rows.map(publicAttachment));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load images' });
  }
}

async function ownedAttachment(id, userId) {
  const { rows } = await db.query(
    `SELECT id, "noteId", "userId", filename, mime, size, path, "createdAt"
     FROM "Attachment" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
    [id, userId],
  );
  return rows[0] || null;
}

export async function getAttachmentFile(req, res) {
  try {
    const attachment = await ownedAttachment(req.params.id, req.userId);
    if (!attachment) return res.status(404).json({ message: 'Image not found' });
    const filePath = path.join(uploadDir, path.basename(attachment.path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Image file not found' });
    res.type(attachment.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load image' });
  }
}

export async function deleteAttachment(req, res) {
  try {
    const attachment = await ownedAttachment(req.params.id, req.userId);
    if (!attachment) return res.status(404).json({ message: 'Image not found' });
    await db.query(`DELETE FROM "Attachment" WHERE id = $1 AND "userId" = $2`, [attachment.id, req.userId]);
    await fs.promises.unlink(path.join(uploadDir, path.basename(attachment.path))).catch(() => {});
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not remove image' });
  }
}

export async function deleteAttachmentsForNote(noteId, userId) {
  const { rows } = await db.query(
    `SELECT path FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`,
    [noteId, userId],
  );
  await db.query(`DELETE FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`, [noteId, userId]);
  await Promise.all(rows.map((row) => fs.promises.unlink(path.join(uploadDir, path.basename(row.path))).catch(() => {})));
}

export function handleUploadError(error, req, res, next) {
  if (!error) return next();
  removeFiles(req.files || []).catch(() => {});
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 5 MB or smaller'
      : error.code === 'LIMIT_FILE_COUNT'
        ? `A note can have at most ${MAX_IMAGES_PER_NOTE} images`
        : 'Only PNG, JPEG, WebP, and GIF images are allowed';
    return res.status(400).json({ message });
  }
  next(error);
}
