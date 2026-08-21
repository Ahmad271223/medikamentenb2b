import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { env } from '@/lib/env';
import { s3StorageAdapter } from './s3';
import type { StorageAdapter, StoredObject } from './storage';

// Local-disk adapter for development. Keys are UUID-based and validated
// against path traversal before touching the filesystem.

function safePath(key: string): string {
  const base = resolve(env().STORAGE_DIR);
  const target = normalize(join(base, key));
  if (!target.startsWith(base + sep) && target !== base) {
    throw new Error('Invalid storage key');
  }
  return target;
}

export const localStorageAdapter: StorageAdapter = {
  async put(key: string, data: Buffer): Promise<StoredObject> {
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return {
      storageKey: key,
      sha256: createHash('sha256').update(data).digest('hex'),
      sizeBytes: data.byteLength,
    };
  },

  async get(key: string): Promise<Buffer> {
    return readFile(safePath(key));
  },

  async exists(key: string): Promise<boolean> {
    try {
      await access(safePath(key));
      return true;
    } catch {
      return false;
    }
  },
};

export function getStorage(): StorageAdapter {
  // S3 in staging/production (configured bucket), local disk in development.
  return env().S3_BUCKET ? s3StorageAdapter : localStorageAdapter;
}
