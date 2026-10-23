/**
 * Database safety checks, run as the API's own login (DATABASE_URL in .env):
 *   npm run test:db
 * Tenant isolation, permissions of the API login, integrity rules, encryption and procedures.
 * Every "must fail" write runs inside a transaction that fails, so no data changes.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { decryptJson, encryptJson } from "../src/lib/crypto.js";
import { prisma, withSystem, withTenant } from "../src/db/prisma.js";

let pass = 0;
let fail = 0;
function ok(condition: boolean, label: string, extra?: unknown) {
  if (condition) pass++;
  else fail++;
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}${!condition && extra !== undefined ? ` — ${String(extra).slice(0, 200)}` : ""}`);
}
/** True when the database refuses the operation. */
async function refused(fn: () => Promise<unknown>) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const orgs = await withSystem((tx) => tx.organization.findMany({ select: { id: true, subdomain: true } }));
  const a = orgs.find((o) => o.subdomain === "greenwood") ?? orgs[0];
  const b = orgs.find((o) => o.id !== a.id);
  if (!a || !b) throw new Error("Needs at least two organizations (run seed.sql and seed:demo / import:frontend).");
  const counts = await withSystem(async (tx) => ({
    a: await tx.student.count({ where: { organizationId: a.id } }),
    b: await tx.student.count({ where: { organizationId: b.id } }),
  }));
  const studentA = await withTenant(a.id, (tx) => tx.student.findFirstOrThrow({ select: { id: true, branchId: true, userId: true } }));
  const studentB = await withTenant(b.id, (tx) => tx.student.findFirstOrThrow({ select: { id: true } }));

  console.log(`Tenant isolation (${a.subdomain} vs ${b.subdomain})`);
  ok((await prisma.student.count()) === 0, "without a context no student rows are visible");
  ok((await withTenant(a.id, (tx) => tx.student.count())) === counts.a, `${a.subdomain} sees exactly its ${counts.a} students`);
  ok((await withTenant(a.id, (tx) => tx.student.findUnique({ where: { id: studentB.id } }))) === null, `${a.subdomain} cannot read a ${b.subdomain} student by id`);
  ok(await refused(() => withTenant(a.id, (tx) => tx.region.create({ data: { organizationId: b.id, name: `x-${randomUUID()}` } }))), "cannot insert a row for another organization");
  ok(await refused(() => withTenant(a.id, (tx) => tx.student.update({ where: { id: studentA.id }, data: { organizationId: b.id } }))), "cannot move a row to another organization");
  ok((await withTenant(a.id, (tx) => tx.student.updateMany({ where: { id: studentB.id }, data: { firstName: "Hacked" } }))).count === 0, "cannot update another organization's student");
  ok((await withTenant(a.id, (tx) => tx.role.count({ where: { organizationId: null } }))) > 0, "built-in roles are readable by every organization");

  console.log("API login permissions");
  ok(await refused(() => prisma.$executeRawUnsafe("ALTER SECURITY POLICY security.TenantIsolation WITH (STATE = OFF)")), "cannot switch off row-level security");
  ok(await refused(() => prisma.$executeRawUnsafe("ALTER TABLE dbo.Student ADD probe INT")), "cannot change tables");
  ok(await refused(() => prisma.$executeRawUnsafe("DROP TABLE dbo.AuditLog")), "cannot drop tables");
  ok(await refused(() => prisma.$executeRawUnsafe("EXEC dbo.usp_Maintenance")), "cannot run administrator maintenance");

  console.log("Integrity rules");
  const paper = await withTenant(a.id, (tx) => tx.examPaper.findFirst({ select: { id: true } }));
  const anyUser = await withTenant(a.id, (tx) => tx.user.findFirstOrThrow({ select: { id: true } }));
  if (paper) {
    ok(await refused(() => withTenant(a.id, (tx) => tx.mark.create({ data: { organizationId: a.id, branchId: studentA.branchId, examPaperId: paper.id, studentId: randomUUID(), marks: 50, enteredById: anyUser.id } }))), "a mark for a student who does not exist is refused (foreign key)");
  }
  ok(await refused(() => withTenant(a.id, (tx) => tx.student.update({ where: { id: studentA.id }, data: { status: "GRADUATED" } }))), "an unknown status is refused (check constraint)");
  ok(await refused(() => withTenant(a.id, (tx) => tx.student.update({ where: { id: studentA.id }, data: { bloodGroup: "Z+" } }))), "an invalid blood group is refused");
  ok(await refused(() => withTenant(a.id, (tx) => tx.expense.create({ data: { organizationId: a.id, branchId: studentA.branchId, date: new Date(), category: "Test", description: "negative", amount: -5, method: "UPI", createdById: anyUser.id } }))), "a negative expense is refused");
  ok(await refused(() => withTenant(a.id, (tx) => tx.leaveRequest.create({ data: { organizationId: a.id, branchId: studentA.branchId, staffId: randomUUID(), type: "SICK", fromDate: new Date("2026-10-10"), toDate: new Date("2026-10-01"), reason: "x" } }))), "leave ending before it starts is refused");
  if (studentA.userId) {
    const other = await withTenant(a.id, (tx) => tx.student.findFirst({ where: { id: { not: studentA.id } }, select: { id: true } }));
    if (other) ok(await refused(() => withTenant(a.id, (tx) => tx.student.update({ where: { id: other.id }, data: { userId: studentA.userId } }))), "two students cannot share one login (filtered unique index)");
  }

  console.log("Encryption & procedures");
  const sealed = encryptJson({ aadhaar: "123412341234" });
  ok(!sealed.includes("123412341234") && decryptJson<{ aadhaar: string }>(sealed)?.aadhaar === "123412341234", "sensitive values are stored encrypted and decrypt back");
  const exported = await withTenant(a.id, (tx) => tx.$queryRaw<{ data: string }[]>`EXEC dbo.usp_StudentDataExport @StudentId = ${studentA.id}`);
  ok(JSON.parse(exported[0]?.data ?? "{}").student?.id?.toLowerCase() === studentA.id.toLowerCase(), "data export procedure returns the student's record");
  ok(await refused(() => withTenant(a.id, (tx) => tx.$queryRaw`EXEC dbo.usp_StudentDataExport @StudentId = ${studentB.id}`)), "data export cannot reach another organization's student");
  ok(await refused(() => withTenant(a.id, (tx) => tx.$queryRaw`EXEC dbo.usp_StudentAnonymize @StudentId = ${studentA.id}`)), "an active student cannot be anonymized");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
