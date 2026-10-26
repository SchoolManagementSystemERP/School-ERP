// Generates database/constraints.sql from prisma/schema.prisma:
//   - foreign keys for id columns Prisma does not model as relations (studentId, createdById, organizationId…)
//   - CHECK constraints for the allowed values written in field comments ("// ACTIVE | LEFT")
//   - range checks for money, counts and date ranges
//   - an index on every foreign-key column that no index starts with
//
//   node scripts/gen-constraints.mjs
//
// The output is idempotent: run it on a new or an existing database (sqlcmd -I, or SSMS).
import { readFileSync, writeFileSync } from "node:fs";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ── Parse models ──────────────────────────────────────────────────────────────
const models = new Map();
for (const m of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
  const [, name, body] = m;
  const fields = [];
  const relationFks = new Set();
  const indexed = new Set(); // first column of every index / unique / primary key
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const block = line.match(/^@@(?:index|unique|id)\(\[(\w+)/);
    if (block) { indexed.add(block[1]); continue; }
    const f = line.match(/^(\w+)\s+(\w+)(\??)(.*)$/);
    if (!f) continue;
    const [, fname, type, optional, rest] = f;
    const rel = rest.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/);
    if (rel) rel[1].split(",").forEach((x) => relationFks.add(x.trim()));
    if (/@id\b|@unique\b/.test(rest)) indexed.add(fname);
    const comment = rest.match(/\/\/\s*(.*)$/)?.[1] ?? "";
    fields.push({ name: fname, type, optional: !!optional, uuid: /@db\.UniqueIdentifier/.test(rest), comment });
  }
  models.set(name, { name, fields, relationFks, indexed });
}

// ── Foreign keys ──────────────────────────────────────────────────────────────
const OVERRIDES = {
  "StudyNote.uploadedById": "Staff", "Attachment.uploadedById": "User",
  "InterviewRound.applicationId": "JobApplication", "JobOffer.applicationId": "JobApplication", "Training.trainerStaffId": "Staff",
};
/** History must outlive the people it mentions, so the audit log keeps user ids without a foreign key. */
const NO_FK = new Set(["AuditLog.userId"]);
function targetOf(model, field) {
  const key = `${model}.${field}`;
  if (OVERRIDES[key]) return OVERRIDES[key];
  if (field === "organizationId") return "Organization";
  if (/^(teacherId|staffId|classTeacherId|driverStaffId)$/.test(field)) return "Staff";
  if (/^(userId|fromUserId|toUserId)$/.test(field) || /ById$/.test(field)) return "User";
  if (/^(studentId|aboutStudentId)$/.test(field)) return "Student";
  if (/^(fileId|resumeFileId)$/.test(field)) return "Attachment";
  if (field === "installmentId") return "FeeInstallment";
  if (/^(from|to)BranchId$/.test(field)) return "Branch";
  if (field === "byUserId") return "User";
  if (field === "poId") return "PurchaseOrder";
  if (field === "grnId") return "GoodsReceipt";
  if (field === "billId") return "VendorBill";
  const guess = field.replace(/Id$/, "");
  const name = guess.charAt(0).toUpperCase() + guess.slice(1);
  return models.has(name) ? name : null;
}

const fks = [];
for (const m of models.values()) {
  for (const f of m.fields) {
    if (!f.uuid || f.name === "id" || !/Id$/.test(f.name) || m.relationFks.has(f.name)) continue;
    if (m.name === "Organization" || NO_FK.has(`${m.name}.${f.name}`)) continue;
    const target = targetOf(m.name, f.name);
    if (!target) throw new Error(`No target table for ${m.name}.${f.name}`);
    fks.push({ table: m.name, column: f.name, target, name: `FK_${m.name}_${f.name}` });
  }
}

// ── Indexes for foreign-key columns ───────────────────────────────────────────
const indexes = [];
for (const m of models.values()) {
  const fkColumns = new Set([...m.relationFks, ...fks.filter((f) => f.table === m.name).map((f) => f.column)]);
  for (const col of fkColumns) {
    if (col === "organizationId" || m.indexed.has(col)) continue; // tenant-leading indexes already cover organizationId lookups
    indexes.push({ table: m.name, column: col, name: `IX_${m.name}_${col}` });
  }
}

// ── CHECK constraints ─────────────────────────────────────────────────────────
const SKIP_VALUE_CHECKS = new Set(["Branch.board"]); // boards beyond the comment's examples are allowed
const checks = [];
for (const m of models.values()) {
  for (const f of m.fields) {
    if (f.type !== "String" || SKIP_VALUE_CHECKS.has(`${m.name}.${f.name}`)) continue;
    const list = f.comment.match(/^([A-Z0-9_]+(?:\s*\|\s*[A-Z0-9_]+)+)\s*$/);
    if (!list) continue;
    const values = list[1].split("|").map((v) => `N'${v.trim()}'`).join(", ");
    checks.push({ table: m.name, name: `CK_${m.name}_${f.name}`, expr: `[${f.name}] IN (${values})` });
  }
}
const BLOOD = "N'A+', N'A-', N'B+', N'B-', N'AB+', N'AB-', N'O+', N'O-'";
const RANGE = [
  ["Student", "bloodGroup", `[bloodGroup] IN (${BLOOD})`],
  ["Plan", "price", "[pricePerBranch] >= 0"],
  ["AcademicYear", "dates", "[endDate] > [startDate]"],
  ["Section", "capacity", "[capacity] > 0"],
  ["TimetablePeriod", "day", "[dayOfWeek] BETWEEN 1 AND 7 AND [periodNo] BETWEEN 1 AND 15"],
  ["ExamPaper", "marks", "[maxMarks] > 0 AND [passMarks] >= 0 AND [passMarks] <= [maxMarks]"],
  ["Mark", "marks", "[marks] IS NULL OR [marks] >= 0"],
  ["AttendanceSession", "period", "[periodNo] IS NULL OR [periodNo] BETWEEN 1 AND 15"],
  ["Assignment", "dates", "[dueDate] >= [assignedDate] AND [totalMarks] >= 0"],
  ["AssignmentSubmission", "marks", "[marksObtained] IS NULL OR [marksObtained] >= 0"],
  ["FeePlan", "amount", "[annualAmount] >= 0"],
  ["FeeInstallment", "percent", "[percent] > 0 AND [percent] <= 100"],
  ["FeeConcession", "percent", "[percent] > 0 AND [percent] <= 100"],
  ["FeePayment", "amount", "[amount] > 0 AND [lateFee] >= 0"],
  ["Expense", "amount", "[amount] > 0"],
  ["Payslip", "amounts", "[gross] >= 0 AND [deductions] >= 0 AND [net] = [gross] - [deductions]"],
  ["Staff", "salary", "[basicSalary] IS NULL OR [basicSalary] >= 0"],
  ["LeaveRequest", "dates", "[toDate] >= [fromDate]"],
  ["Book", "copies", "[totalCopies] >= 0"],
  ["BookLoan", "dates", "[dueDate] >= [issueDate] AND ([returnDate] IS NULL OR [returnDate] >= [issueDate]) AND [finePaid] >= 0"],
  ["BookLoan", "borrower", "[studentId] IS NOT NULL OR [staffId] IS NOT NULL"],
  ["InventoryItem", "stock", "[quantity] >= 0 AND [minQuantity] >= 0 AND [unitPrice] >= 0"],
  ["StockMovement", "quantity", "[quantity] > 0"],
  ["Vehicle", "capacity", "[capacity] > 0"],
  ["TransportRoute", "fee", "[monthlyFee] >= 0"],
  ["HostelRoom", "capacity", "[capacity] > 0"],
  ["HostelAllocation", "dates", "[toDate] IS NULL OR [toDate] >= [fromDate]"],
  ["Outpass", "dates", "[toDate] >= [fromDate]"],
  ["Visitor", "times", "[people] > 0 AND ([outAt] IS NULL OR [outAt] >= [inAt])"],
  ["JobOpening", "dates", "[vacancies] > 0 AND [lastDate] >= [postedOn]"],
  ["JobApplication", "experience", "[experienceYears] BETWEEN 0 AND 60"],
  ["AlumniMember", "batch", "[batchYear] BETWEEN 1900 AND 2100"],
  ["Holiday", "dates", "[endDate] >= [startDate]"],
  ["StudentTransfer", "branches", "[fromBranchId] <> [toBranchId]"],
  ["PaymentOrder", "amount", "[amount] > 0 AND [lateFee] >= 0"],
  ["PaymentOrder", "gateway", "[gateway] IN (N'RAZORPAY')"],
  ["OtpCode", "attempts", "[attempts] BETWEEN 0 AND 10"],
  ["IndentLine", "qty", "[qty] > 0 AND [estRate] >= 0 AND ([issuedFromStock] IS NULL OR [issuedFromStock] BETWEEN 0 AND [qty]) AND ([toPurchase] IS NULL OR [toPurchase] BETWEEN 0 AND [qty])"],
  ["Quotation", "terms", "[gstPercent] BETWEEN 0 AND 28 AND [deliveryDays] >= 0"],
  ["QuotationLine", "rate", "[rate] > 0"],
  ["PurchaseOrder", "terms", "[gstPercent] BETWEEN 0 AND 28 AND [deliveryBy] >= [orderDate]"],
  ["PurchaseOrderLine", "qty", "[qty] > 0 AND [rate] > 0 AND [received] BETWEEN 0 AND [qty] AND [accepted] BETWEEN 0 AND [received]"],
  ["GoodsReceiptLine", "qty", "[received] > 0 AND [accepted] BETWEEN 0 AND [received]"],
  ["VendorBill", "amounts", "[subtotal] > 0 AND [gst] >= 0 AND [total] = [subtotal] + [gst] AND [expected] >= 0"],
  ["VendorPayment", "amounts", "[gross] > 0 AND [tds] >= 0 AND [net] = [gross] - [tds]"],
  ["PettyCashVoucher", "amount", "[amount] > 0"],
  ["StaffAttendance", "times", "([inTime] IS NULL OR [outTime] IS NULL OR [outTime] >= [inTime])"],
  ["ExpenseClaim", "amount", "[amount] > 0"],
  ["InterviewRound", "rating", "[roundNo] > 0 AND ([rating] IS NULL OR [rating] BETWEEN 1 AND 5)"],
  ["JobOffer", "terms", "[ctcAnnual] > 0 AND [validTill] >= CAST([createdAt] AS DATE)"],
  ["JobApplication", "screening", "[screeningScore] IS NULL OR [screeningScore] BETWEEN 0 AND 100"],
  ["Training", "dates", "[endDate] >= [startDate] AND [durationHours] > 0 AND [passPercent] BETWEEN 0 AND 100"],
  ["TrainingQuestion", "answer", "[answerIndex] >= 0"],
  ["TrainingEnrollment", "scores", "([preScore] IS NULL OR [preScore] BETWEEN 0 AND 100) AND ([postScore] IS NULL OR [postScore] BETWEEN 0 AND 100) AND ([rating] IS NULL OR [rating] BETWEEN 1 AND 5)"],
  ["Separation", "dates", "[lastWorkingDay] >= [noticeDate]"],
  ["Membership", "scope", "([scopeType] = N'ORG' AND [regionId] IS NULL AND [branchId] IS NULL) OR ([scopeType] = N'REGION' AND [regionId] IS NOT NULL AND [branchId] IS NULL) OR ([scopeType] = N'BRANCH' AND [branchId] IS NOT NULL AND [regionId] IS NULL)"],
];
for (const [table, suffix, expr] of RANGE) {
  if (!models.has(table)) throw new Error(`Unknown table ${table}`);
  checks.push({ table, name: `CK_${table}_${suffix}`, expr });
}

// ── Write SQL ─────────────────────────────────────────────────────────────────
const out = [];
out.push(`-- School ERP — integrity rules not expressed in schema.prisma. GENERATED by scripts/gen-constraints.mjs; do not edit by hand.
-- Run after schema.sql (new database) or any time on an existing one: every statement is idempotent.
--   sqlcmd -S localhost -E -C -I -d school_erp -i database/constraints.sql
-- ${fks.length} foreign keys · ${checks.length} check constraints · ${indexes.length} indexes

SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
BEGIN TRAN;
`);
out.push("-- Foreign keys (NO ACTION: records are deactivated, never cascaded away)");
for (const f of fks) {
  out.push(`IF OBJECT_ID(N'dbo.${f.name}', N'F') IS NULL ALTER TABLE [dbo].[${f.table}] WITH CHECK ADD CONSTRAINT [${f.name}] FOREIGN KEY ([${f.column}]) REFERENCES [dbo].[${f.target}] ([id]);`);
}
out.push("\n-- Allowed values and ranges (dropped and re-added so a changed rule always applies)");
for (const c of checks) {
  out.push(`IF OBJECT_ID(N'dbo.${c.name}', N'C') IS NOT NULL ALTER TABLE [dbo].[${c.table}] DROP CONSTRAINT [${c.name}];`);
  out.push(`ALTER TABLE [dbo].[${c.table}] WITH CHECK ADD CONSTRAINT [${c.name}] CHECK (${c.expr});`);
}
out.push("\n-- Indexes on foreign-key columns (SQL Server does not create them automatically)");
for (const i of indexes) {
  out.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${i.name}' AND object_id = OBJECT_ID(N'dbo.${i.table}')) CREATE NONCLUSTERED INDEX [${i.name}] ON [dbo].[${i.table}] ([${i.column}]);`);
}
out.push("\nCOMMIT;\nPRINT 'constraints.sql applied';\n");
writeFileSync(new URL("../database/constraints.sql", import.meta.url), out.join("\n"));
console.log(`database/constraints.sql: ${fks.length} foreign keys, ${checks.length} checks, ${indexes.length} indexes`);
