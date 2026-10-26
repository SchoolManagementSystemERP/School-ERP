import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * The only PrismaClient. Route code never queries tenant tables with it directly: tenant data
 * is read and written through `withTenant`, which tells SQL Server's row-level security which
 * organization the request belongs to. Only tables outside the policy (Plan, Permission,
 * RefreshToken) and health checks use this client as is.
 */
export const prisma = new PrismaClient({
  // Prisma 7 talks to SQL Server through the mssql driver; it reads the same sqlserver:// URL
  adapter: new PrismaMssql(process.env.DATABASE_URL ?? ''),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Tx = Prisma.TransactionClient;

const NO_ORG = '00000000-0000-0000-0000-000000000000';

function setContext(tx: Tx, organizationId: string, platform: boolean) {
  return tx.$executeRaw`EXEC sys.sp_set_session_context @key = N'organization_id', @value = ${organizationId};
                        EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = ${platform ? 1 : 0};`;
}

/**
 * Runs `fn` in one transaction (one pooled connection) with the session context set for the
 * row-level security policy. Session context belongs to the connection, not the transaction,
 * so it is written at the start (overwriting anything a previous request left) and cleared at
 * the end, before the connection goes back to the pool.
 */
type TxOptions = { timeout?: number };

async function withContext<T>(organizationId: string | null, platform: boolean, fn: (tx: Tx) => Promise<T>, options: TxOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await setContext(tx, organizationId ?? NO_ORG, platform);
      try {
        return await fn(tx);
      } finally {
        await setContext(tx, NO_ORG, false).catch(() => undefined);
      }
    },
    { maxWait: 5_000, timeout: options.timeout ?? 20_000 },
  );
}

/** Normal request work: sees and writes only this organization's rows. */
export function withTenant<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withContext(organizationId, false, fn);
}

/**
 * Cross-organization access. Only for sign-in (finding the organization and user before the
 * organization is known), platform administration and seed scripts — never for request data.
 */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>, options?: TxOptions): Promise<T> {
  return withContext(null, true, fn, options);
}
