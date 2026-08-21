import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import type { StorageAdapter, StoredObject } from './storage';

// S3-compatible adapter for staging/production (AWS S3, Hetzner Object
// Storage, MinIO, …). Selected automatically when S3_BUCKET is configured;
// documents remain private — access always flows through permission-checked
// API routes, never through public bucket URLs.

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: e.S3_REGION,
    ...(e.S3_ENDPOINT ? { endpoint: e.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials:
      e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return client;
}

export const s3StorageAdapter: StorageAdapter = {
  async put(key: string, data: Buffer): Promise<StoredObject> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        Body: data,
        ServerSideEncryption: 'AES256',
      }),
    );
    return {
      storageKey: key,
      sha256: createHash('sha256').update(data).digest('hex'),
      sizeBytes: data.byteLength,
    };
  },

  async get(key: string): Promise<Buffer> {
    const result = await getClient().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  },

  async exists(key: string): Promise<boolean> {
    try {
      await getClient().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  },
};
