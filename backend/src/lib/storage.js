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
      console.warn('[storage] S3_BUCKET not set — falling back to local');
      return localProvider.save(file);
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
      console.warn('[storage] S3 save failed, falling back to local', e.message);
      return localProvider.save(file);
    }
  },
  async remove(storedPath) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return localProvider.remove(storedPath);
    try {
      const client = await getS3Client();
      if (!client) throw new Error('S3 client not configured');
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: path.basename(storedPath),
      }));
    } catch (e) {
      console.warn('[storage] S3 remove failed, trying local fallback', e.message);
      await localProvider.remove(storedPath);
    }
  },
  async removeMany(storedPaths = []) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return localProvider.removeMany(storedPaths);
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
      console.warn('[storage] S3 removeMany failed, falling back to local', e.message);
      await localProvider.removeMany(storedPaths);
    }
  },
  exists(storedPath) {
    // For performance, we assume exists if we have key; real check would be HeadObject async
    // Synchronous exists check can't be S3 — return true to allow attempt, actual 404 handled in getStream
    return true;
  },
  fullPath(storedPath) {
    // For S3, fullPath is not a local path — return key for reference
    return path.basename(storedPath);
  },
  async getStream(storedPath) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return localProvider.getStream(storedPath);
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
      // Fallback to local if S3 fails
      if (localProvider.exists(storedPath)) return localProvider.getStream(storedPath);
      throw e;
    }
  },
  async probeWritable() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return localProvider.probeWritable();
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
