import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { purgeExpiredAssistantMemory } from './modules/assistant/assistant.routes.js';

const server = createApp().listen(env.PORT, () => {
  console.log(`School ERP API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

// Jarvis memory lasts ASSISTANT_MEMORY_MINUTES (10 minutes by default): sweep expired messages every minute,
// also for users who never come back.
const purgeMemory = () => purgeExpiredAssistantMemory().catch((error: unknown) => console.error('Assistant memory cleanup failed:', error));
void purgeMemory();
setInterval(() => void purgeMemory(), 60_000).unref();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
