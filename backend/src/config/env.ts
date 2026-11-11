import 'dotenv/config';
import { z } from 'zod';

const localModelUrl = z.string().url().refine((value) => {
  const { hostname } = new URL(value);
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}, 'OLLAMA_BASE_URL must point to a local Ollama server');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().startsWith('sqlserver://', 'DATABASE_URL must be a sqlserver:// connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DATA_ENCRYPTION_KEY: z.string().refine((s) => Buffer.from(s, 'base64').length === 32, 'DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  OLLAMA_BASE_URL: localModelUrl.default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).default('qwen2.5:7b'),
  /** How long to wait for one assistant reply. Small CPU-only machines need a small model (e.g. qwen2.5:1.5b). */
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(120_000),
  /** How much of the visible page text goes to the model — the prompt size is what makes CPU replies slow. */
  ASSISTANT_PAGE_CHARS: z.coerce.number().int().min(500).max(14_000).default(3_500),
  /** Jarvis forgets a conversation this many minutes after it was said (deleted from the database). */
  ASSISTANT_MEMORY_MINUTES: z.coerce.number().int().min(1).max(60 * 24 * 30).default(60),
  /** Lets students / parents record "online" fee payments without a gateway — for demos only, never in production. */
  DEMO_PAYMENTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment (see .env.example):');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.DEMO_PAYMENTS) {
  console.error('DEMO_PAYMENTS must be false in production (fee payments must come from the payment gateway).');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
