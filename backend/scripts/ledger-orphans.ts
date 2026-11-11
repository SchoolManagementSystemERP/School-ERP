/**
 * Ledger entries whose source record (fee payment, refund, expense, payroll run, vendor payment…) no longer
 * exists — e.g. left behind by older test runs, which deleted their records but not the automatic entries.
 *   npm run ledger:orphans              report per source type
 *   npm run ledger:orphans -- --delete  remove them (cannot be undone)
 * Manual vouchers and source types this script does not know are never touched.
 */
import "dotenv/config";
import { prisma, withSystem } from "../src/db/prisma.js";

const remove = process.argv.includes("--delete");
const out = await withSystem(async (tx) => {
  const entries = await tx.journalEntry.findMany({ where: { sourceId: { not: null } }, select: { id: true, sourceType: true, sourceId: true } });
  const types = [...new Set(entries.map((e) => e.sourceType))];
  const exists = async (type: string, ids: string[]): Promise<Set<string> | null> => {
    const where = { where: { id: { in: ids } }, select: { id: true } };
    const rows: { id: string }[] | null =
      type === "FEE_PAYMENT" ? await tx.feePayment.findMany(where)
      : type === "FEE_REFUND" ? await tx.feeRefund.findMany(where)
      : type === "EXPENSE" ? await tx.expense.findMany(where)
      : type === "STAFF_ADVANCE" ? await tx.staffAdvance.findMany(where)
      : type === "PAYROLL_RUN" ? await tx.payrollRun.findMany(where)
      : type === "VENDOR_PAYMENT" ? await tx.vendorPayment.findMany(where)
      : null; // a type we do not know how to check: leave it alone
    return rows ? new Set(rows.map((r) => r.id.toLowerCase())) : null;
  };
  const report: Record<string, { total: number; orphans: number }> = {};
  const orphanIds: string[] = [];
  for (const type of types) {
    const ofType = entries.filter((e) => e.sourceType === type);
    const present = await exists(type, ofType.map((e) => e.sourceId!));
    if (!present) continue;
    const orphans = ofType.filter((e) => !present.has(e.sourceId!.toLowerCase()));
    report[type] = { total: ofType.length, orphans: orphans.length };
    orphanIds.push(...orphans.map((o) => o.id));
  }
  if (remove && orphanIds.length) {
    await tx.journalLine.deleteMany({ where: { journalEntryId: { in: orphanIds } } });
    await tx.journalEntry.deleteMany({ where: { id: { in: orphanIds } } });
  }
  return { report, orphanEntries: orphanIds.length, deleted: remove ? orphanIds.length : 0 };
});
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
