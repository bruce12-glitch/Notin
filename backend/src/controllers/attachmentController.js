import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import db from '../config/db.js';
import { logError } from '../lib/logging.js';
import { ID_RE } from '../lib/validation.js';
import { sendInternalError } from '../lib/apiResponse.js';
import attachmentStorage, { uploadDir, MAX_IMAGE_BYTES, MAX_IMAGES_PER_NOTE, MAX_ATTACHMENT_STORAGE_BYTES } from '../lib/storage.js';

export { uploadDir, MAX_IMAGE_BYTES, MAX_IMAGES_PER_NOTE, MAX_ATTACHMENT_STORAGE_BYTES };
// WP-HARDEN-001 — route params are user input too: reject ids that cannot
// possibly exist before any DB/file work.
function invalidId(value) {
  return typeof value !== 'string' || !ID_RE.test(value);
}

const allowedMimes = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  // WP-MEDIA-001 — documents & voice notes
  'application/pdf',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
]);
const extensionByMime = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};
// Per-type byte ceilings. Multer's hard cap is the largest of these; the
// per-type limit is enforced after upload (mime is trusted post-signature).
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = MAX_AUDIO_BYTES;
const byteCapByMime = (mime) => {
  if (mime === 'application/pdf') return MAX_PDF_BYTES;
  if (mime && mime.startsWith('audio/')) return MAX_AUDIO_BYTES;
  return MAX_IMAGE_BYTES;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${extensionByMime[file.mimetype] || ''}`),
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_IMAGES_PER_NOTE },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'images'));
    cb(null, true);
  },
}).array('images', MAX_IMAGES_PER_NOTE);

// WP-AI-009 — single audio upload for the transcribe endpoint
export const audioUpload = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('audio/')) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'audio'));
    cb(null, true);
  },
}).single('audio');

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

async function hasExpectedImageSignature(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (file.mimetype === 'image/png') {
      return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (file.mimetype === 'image/jpeg') {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === 'image/gif') {
      const signature = header.subarray(0, 6).toString('ascii');
      return signature === 'GIF87a' || signature === 'GIF89a';
    }
    if (file.mimetype === 'image/webp') {
      return bytesRead >= 12
        && header.subarray(0, 4).toString('ascii') === 'RIFF'
        && header.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    // WP-MEDIA-001 — documents & voice notes
    if (file.mimetype === 'application/pdf') {
      return bytesRead >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (file.mimetype === 'audio/webm') {
      // EBML magic — Matroska/WebM containers
      return bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    }
    if (file.mimetype === 'audio/ogg') {
      return bytesRead >= 4 && header.subarray(0, 4).toString('ascii') === 'OggS';
    }
    if (file.mimetype === 'audio/mpeg') {
      // ID3 tag or a raw MPEG audio frame sync (0xFFEx)
      if (bytesRead >= 3 && header.subarray(0, 3).toString('ascii') === 'ID3') return true;
      return bytesRead >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
    }
    if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav') {
      return bytesRead >= 12
        && header.subarray(0, 4).toString('ascii') === 'RIFF'
        && header.subarray(8, 12).toString('ascii') === 'WAVE';
    }
    if (file.mimetype === 'audio/mp4' || file.mimetype === 'audio/x-m4a') {
      // ISO-BMFF: bytes 4-8 are the "ftyp" box name
      return bytesRead >= 8 && header.subarray(4, 8).toString('ascii') === 'ftyp';
    }
    return false;
  } finally {
    await handle.close();
  }
}

export async function ensureAttachmentCapacity(req, res, next) {
  try {
    if (invalidId(req.params.noteId)) return res.status(400).json({ message: 'Invalid note id' });
    const note = await ownedNote(req.params.noteId, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const trashed = note.isTrashed === true || note.isTrashed === 1 || note.isTrashed === '1' || note.isTrashed === 't';
    if (trashed) return res.status(400).json({ message: 'Restore the note before attaching images' });
    const [{ rows: noteRows }, { rows: usageRows }] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS count FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`,
        [note.id, req.userId],
      ),
      db.query(
        `SELECT COALESCE(SUM(size), 0) AS bytes FROM "Attachment" WHERE "userId" = $1`,
        [req.userId],
      ),
    ]);
    req.attachmentCount = Number(noteRows[0]?.count || 0);
    req.attachmentStorageBytes = Number(usageRows[0]?.bytes || 0);
    next();
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not prepare image upload', 'ensureAttachmentCapacity');
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

    const uploadedBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if ((req.attachmentStorageBytes || 0) + uploadedBytes > MAX_ATTACHMENT_STORAGE_BYTES) {
      await removeFiles(files);
      return res.status(403).json({ message: 'Attachment storage limit reached', code: 'STORAGE_QUOTA_REACHED' });
    }

    const signatures = await Promise.all(files.map(hasExpectedImageSignature));
    if (signatures.some((valid) => !valid)) {
      await removeFiles(files);
      return res.status(400).json({ message: 'An uploaded file does not match its declared type' });
    }

    // WP-MEDIA-001 — per-type byte caps (images 5MB, PDF 15MB, audio 25MB)
    const oversized = files.find((file) => file.size > byteCapByMime(file.mimetype));
    if (oversized) {
      await removeFiles(files);
      const cap = byteCapByMime(oversized.mimetype);
      return res.status(400).json({ message: `That file is too large — the limit for ${oversized.mimetype.startsWith('audio/') ? 'audio' : oversized.mimetype === 'application/pdf' ? 'PDFs' : 'images'} is ${Math.round(cap / (1024 * 1024))} MB` });
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
    return sendInternalError(req, res, error, 'Image upload failed', 'uploadImages');
  }
}

export async function listAttachments(req, res) {
  try {
    if (invalidId(req.params.noteId)) return res.status(400).json({ message: 'Invalid note id' });
    const note = await ownedNote(req.params.noteId, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const { rows } = await db.query(
      `SELECT id, "noteId", "userId", filename, mime, size, path, "createdAt"
       FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2 ORDER BY "createdAt" ASC`,
      [note.id, req.userId],
    );
    res.json(rows.map(publicAttachment));
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not load images', 'listAttachments');
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
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid attachment id' });
    const attachment = await ownedAttachment(req.params.id, req.userId);
    if (!attachment) return res.status(404).json({ message: 'Image not found' });
    // Local: check exists synchronously; S3: exists always true, actual 404 handled in getStream
    if (attachmentStorage.name === 'local' && !attachmentStorage.exists(attachment.path)) {
      return res.status(404).json({ message: 'Image file not found' });
    }
    res.type(attachment.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (attachmentStorage.name === 's3') {
      try {
        const stream = await attachmentStorage.getStream(attachment.path);
        // S3 Body is a readable stream (Node.js or Web stream); pipe if possible
        if (stream && typeof stream.pipe === 'function') {
          return stream.pipe(res);
        } else if (stream && typeof stream.getReader === 'function') {
          // Web stream fallback
          const reader = stream.getReader();
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) return res.end();
            res.write(value);
            return pump();
          };
          return pump();
        } else {
          // Fallback to sendFile for local fallback path
          const filePath = attachmentStorage.fullPath(attachment.path);
          return res.sendFile(filePath);
        }
      } catch (e) {
        return res.status(404).json({ message: 'Image file not found' });
      }
    } else {
      const filePath = attachmentStorage.fullPath(attachment.path);
      return res.sendFile(filePath);
    }
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not load image', 'getAttachmentFile');
  }
}

export async function deleteAttachment(req, res) {
  try {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid attachment id' });
    const attachment = await ownedAttachment(req.params.id, req.userId);
    if (!attachment) return res.status(404).json({ message: 'Image not found' });
    await db.query(`DELETE FROM "Attachment" WHERE id = $1 AND "userId" = $2`, [attachment.id, req.userId]);
    await attachmentStorage.remove(attachment.path);
    res.status(204).end();
  } catch (error) {
    return sendInternalError(req, res, error, 'Could not remove image', 'deleteAttachment');
  }
}

export async function deleteAttachmentsForNote(noteId, userId) {
  const { rows } = await db.query(
    `SELECT path FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`,
    [noteId, userId],
  );
  await db.query(`DELETE FROM "Attachment" WHERE "noteId" = $1 AND "userId" = $2`, [noteId, userId]);
  await attachmentStorage.removeMany(rows.map(r => r.path));
}

export function handleUploadError(error, req, res, next) {
  if (!error) return next();
  removeFiles(req.files || []).catch(() => {});
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large (images 5 MB, PDFs 15 MB, audio 25 MB)'
      : error.code === 'LIMIT_FILE_COUNT'
        ? `A note can have at most ${MAX_IMAGES_PER_NOTE} files`
        : 'Only PNG, JPEG, WebP, GIF, PDF, and audio files are allowed';
    return res.status(400).json({ message });
  }
  next(error);
}

// -- WP-AI-009 � record/upload audio, store it, transcribe it (Groq Whisper or
// deterministic mock), and append the transcript to the note. The audio stays
// a normal attachment; the transcript is plain note text (export-friendly).
import { transcribeAudio } from '../lib/ai/provider.js';

export async function transcribeUpload(req, res) {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ message: 'Choose an audio recording to transcribe' });
    if (!(await hasExpectedImageSignature(file))) {
      await removeFiles([file]);
      return res.status(400).json({ message: 'That file does not look like a valid audio recording' });
    }
    const note = await ownedNote(req.params.noteId, req.userId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.isTrashed === true || note.isTrashed === 1 || note.isTrashed === '1' || note.isTrashed === 't') {
      await removeFiles([file]);
      return res.status(400).json({ message: 'Restore the note before transcribing' });
    }

    // Store the recording as a regular attachment first (never lose bytes).
    const id = `att_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const originalName = path.basename(file.originalname || 'recording').slice(0, 255);
    const { rows } = await db.query(
      `INSERT INTO "Attachment" (id, "noteId", "userId", filename, mime, size, path, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, "noteId", "userId", filename, mime, size, path, "createdAt"`,
      [id, req.params.noteId, req.userId, originalName, file.mimetype, file.size, file.filename, now],
    );

    // Transcribe. A provider failure keeps the attachment but reports 503 �
    // the bytes are safe, only the text step failed.
    let transcript;
    let provider;
    try {
      const durationHint = Number(req.body?.durationSec);
      const buffer = await fs.promises.readFile(file.path);
      const result = await transcribeAudio({
        buffer,
        mime: file.mimetype,
        filename: file.filename,
        durationHintSec: Number.isFinite(durationHint) ? durationHint : undefined,
      });
      transcript = result.transcript;
      provider = result.provider;
    } catch (error) {
      if (error?.message === 'AI_PROVIDER_ERROR') {
        return res.status(503).json({ message: 'Transcription is busy right now \u2014 try again in a moment', attachment: publicAttachment(rows[0]) });
      }
      throw error;
    }

    // Append the transcript to the note text (server-timestamped write).
    const { rows: noteRows } = await db.query(
      `SELECT COALESCE("contentText", '') AS text FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [req.params.noteId, req.userId],
    );
    const existing = String(noteRows[0]?.text || '');
    const stamped = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const block = `\n\nTranscript (${stamped}):\n${transcript}`;
    await db.query(
      `UPDATE "Note" SET "contentText" = $1, description = $2, "updatedAt" = $3 WHERE id = $4 AND "userId" = $5`,
      [existing + block, (existing + block).slice(0, 100000), new Date().toISOString(), req.params.noteId, req.userId],
    );

    return res.status(201).json({ attachment: publicAttachment(rows[0]), transcript, provider });
  } catch (error) {
    if (file) await removeFiles([file]);
    return sendInternalError(req, res, error, 'Transcription failed', 'transcribeUpload');
  }
}
