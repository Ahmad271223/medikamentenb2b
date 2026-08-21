import { z } from 'zod';

// Server-only environment validation — fails fast with a readable message.
// Never import this from client components.

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  STORAGE_DIR: z.string().default('./var/storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** SMTP connection URL (smtp://user:pass@host:port). Absent ⇒ console mailer (dev). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('PharmaBridge <no-reply@localhost>'),
  /** S3-compatible object storage. Absent ⇒ local-disk adapter (dev). */
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
