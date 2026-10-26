import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/** Prisma CLI settings (generate, migrate diff). The API connects through the SQL Server adapter in src/db/prisma.ts. */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
});
