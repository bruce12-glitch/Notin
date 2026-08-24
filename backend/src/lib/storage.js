// WP-STORAGE-001 — storage abstraction layer for attachments
// Current implementation: local disk under UPLOAD_DIR (default backend/uploads)
// Future: S3/R2 provider via env STORAGE_PROVIDER=s3 (presigned URLs, streaming)
// This module exposes a provider-agnostic interface so controllers never touch fs directly.

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

// Local provider implementation
const localProvider = {
  async save(file) {
    // multer already saved to uploadDir with random filename; just return basename
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

// Future S3 provider stub — returns local behavior until configured
const s3ProviderStub = {
  async save(file) {
    // TODO: upload to S3 bucket via AWS SDK, return S3 key
    console.warn('[storage] STORAGE_PROVIDER=s3 but S3 SDK not configured — falling back to local');
    return localProvider.save(file);
  },
  async remove(storedPath) {
    // TODO: delete from S3
    return localProvider.remove(storedPath);
  },
  async removeMany(storedPaths) {
    return localProvider.removeMany(storedPaths);
  },
  exists(storedPath) {
    return localProvider.exists(storedPath);
  },
  fullPath(storedPath) {
    return localProvider.fullPath(storedPath);
  },
  async probeWritable() {
    // TODO: S3 headBucket + putObject test
    return localProvider.probeWritable();
  }
};

export function getStorage() {
  if (storageProvider === 's3') return s3ProviderStub;
  return localProvider;
}

export default getStorage();
