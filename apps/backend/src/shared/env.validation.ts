import { z } from 'zod';

const envSchema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_PORT: z.string().default('3000'),
  BACKEND_PORT: z.string().default('3001'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  DISCOGS_CONSUMER_KEY: z.string().optional(),
  DISCOGS_CONSUMER_SECRET: z.string().optional(),
  DISCOGS_USER_TOKEN: z.string().optional(),
  DISCOGS_USERNAME: z.string().optional(),
  DISCOGS_API_BASE_URL: z.string().url().default('https://api.discogs.com'),
  SELECTEL_S3_ENDPOINT: z.string().optional(),
  SELECTEL_S3_REGION: z.string().default('ru-1'),
  SELECTEL_S3_ACCESS_KEY: z.string().optional(),
  SELECTEL_S3_SECRET_KEY: z.string().optional(),
  SELECTEL_S3_BUCKET_COVERS: z.string().default('covers'),
  SELECTEL_S3_BUCKET_AUDIO: z.string().default('audio'),
  SELECTEL_S3_BUCKET_AVATARS: z.string().optional(),
  REGISTRATION_INVITE_CODE: z.string().optional(),
  REGISTRATION_INVITE_CODE_ADMIN: z.string().optional(),
});

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
