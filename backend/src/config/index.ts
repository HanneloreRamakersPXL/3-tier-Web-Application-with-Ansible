import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('cinevote'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  API_VERSION: z.string().default('1.0.0'),
  HMAC_SECRET: z.string().default(() => crypto.randomBytes(32).toString('hex')),
  JWT_SECRET: z.string().default(() => crypto.randomBytes(32).toString('hex')),
  TMDB_API_KEY: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const config = parsed.data;

export default config;
