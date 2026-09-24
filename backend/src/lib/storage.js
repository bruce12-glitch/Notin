// WP-STORAGE-001 + WP-STORAGE-002 — storage abstraction layer for attachments
// Provider interface: local disk (default) + S3/R2 via @aws-sdk/client-s3
// Env: STORAGE_PROVIDER=local|s3, S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_ENDPOINT (optional for R2/MinIO), S3_FORCE_PATH_STYLE (true for MinIO)
// Controllers never touch fs directly except via this module.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_NOTE = 10;

const configuredStorageQuota = Number.parseInt(process.env.MAX_ATTACHMENT_STORAGE_BYTES || String(250 * 1024 * 1024), 10);
export const MAX_ATTACHMENT_STORAGE_BYTES = Number.isSafeInteger(configuredStorageQuota) && configuredStorageQuota > 0
  ? configuredStorageQuota
  : 250 * 1024 * 1024;

fs.mkdirSync(uploadDir, { recursive: true });

export const storageProvider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase(); // local | s3

// WP-AUDIT-M5 — an s3 deployment with a missing bucket or a failing SDK must
// fail loudly. Silently falling back to local disk would split attachment data
// across two stores and report success for files that are lost on redeploy.
if (storageProvider === 's3' && !process.env.S3_BUCKET) {
  console.error('FATAL: STORAGE_PROVIDER=s3 requires S3_BUCKET — refusing silent local-disk fallback');
  process.exit(1);
}
function s3Fail(action, err) {
  const e = new Error(`S3 storage ${action} failed: ${err?.message || err || 'not configured'}`);
  e.cause = err;
  return e;
}

// Local provider
const localProvider = {
  name: 'local',
  async save(file) {
    // multer already saved to uploadDir with random filename; return basename
    return path.basename(file.path || file.filename);
  },
  async remove(storedPath) {
    const filePath = path.join(uploadDir, path.basename(storedPath));
    await fs.promises.unlink(filePath).catch(() => {});
  },
  async removeMany(storedPaths = []) {
    await Promise.all(storedPaths.map(p => localProvider.remove(p)));
  },
  exists(storedPath) {
    const filePath = path.join(uploadDir, path.basename(storedPath));
    return fs.existsSync(filePath);
  },
  fullPath(storedPath) {
    return path.join(uploadDir, path.basename(storedPath));
  },
  getStream(storedPath) {
    const filePath = path.join(uploadDir, path.basename(storedPath));
    return fs.createReadStream(filePath);
  },
  async probeWritable() {
    const probePath = path.join(uploadDir, `.healthwrite-${process.pid}-${Date.now()}`);
    try {
      await fs.promises.writeFile(probePath, 'ok');
      await fs.promises.unlink(probePath).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
};

// S3 provider — real implementation via @aws-sdk/client-s3, lazy-loaded so local dev doesn't need SDK
let s3Client = null;
async function getS3Client() {
  if (s3Client) return s3Client;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  const { S3Client } = await import('@aws-sdk/client-s3');
  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true';
  s3Client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
  });
  return s3Client;
}

const s3Provider = {
  name: 's3',
  async save(file) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw s3Fail('save', 'S3_BUCKET not set');
    }
    try {
      const client = await getS3Client();
      if (!client) throw new Error('S3 client not configured');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const key = path.basename(file.path || file.filename);
      const fileStream = fs.createReadStream(file.path);
      const fileSize = fs.statSync(file.path).size;
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
        ContentLength: fileSize,
      }));
      // Remove local temp file after successful upload
      await fs.promises.unlink(file.path).catch(() => {});
      return key;
    } catch (e) {
      throw s3Fail('save', e);
    }
  },
  async remove(storedPath) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw s3Fail('remove', 'S3_BUCKET not set');
    try {
      const client = await getS3Client();
      if (!client) throw new Error('S3 client not configured');
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: path.basename(storedPath),
      }));
    } catch (e) {
      throw s3Fail('remove', e);
    }
  },
  async removeMany(storedPaths = []) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw s3Fail('removeMany', 'S3_BUCKET not set');
    try {
      const client = await getS3Client();
      if (!client) throw new Error('S3 client not configured');
      const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
      const keys = storedPaths.map(p => ({ Key: path.basename(p) }));
      if (!keys.length) return;
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys, Quiet: true },
      }));
    } catch (e) {
      throw s3Fail('removeMany', e);
    }
  },
  // WP-AUDIT-M5 — real existence check instead of unconditional true.
  // (Callers must await; the local provider's exists stays synchronous and is
  // the only one used in sync contexts.)
  async exists(storedPath) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw s3Fail('exists', 'S3_BUCKET not set');
    const client = await getS3Client();
    if (!client) throw s3Fail('exists', 'S3 client not configured');
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: path.basename(storedPath) }));
      return true;
    } catch (e) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return false;
      throw s3Fail('exists', e);
    }
  },
  fullPath(storedPath) {
    // For S3, fullPath is not a local path — return key for reference
    return path.basename(storedPath);
  },
  async getStream(storedPath) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw s3Fail('getStream', 'S3_BUCKET not set');
    try {
      const client = await getS3Client();
      if (!client) throw new Error('S3 client not configured');
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const result = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: path.basename(storedPath),
      }));
      return result.Body; // Readable stream
    } catch (e) {
      throw s3Fail('getStream', e);
    }
  },
  async probeWritable() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return false;
    try {
      const client = await getS3Client();
      if (!client) return false;
      const { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      const testKey = `.healthwrite-${process.pid}-${Date.now()}`;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: testKey, Body: 'ok' }));
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
      return true;
    } catch {
      return false;
    }
  }
};

export function getStorage() {
  if (storageProvider === 's3') return s3Provider;
  return localProvider;
}

export default getStorage();
