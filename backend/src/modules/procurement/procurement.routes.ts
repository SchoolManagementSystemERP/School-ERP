/**
 * Procurement API: indent → HOD → store → principal / management → quotation → PO → GRN → bill → payment,
 * plus vendors and petty cash. Every action checks the indent's current status and the caller's permission,
 * so no step can be skipped or done by the wrong person.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { scopeBranches, targetBranch, type RequestContext } from "../../auth/access.js";
import { withTenant, type Tx } from "../../db/prisma.js";
import { audit } from "../../lib/audit.js";
import { decryptJson, encryptJson } from "../../lib/crypto.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { dateOnly, idParam, toDateString } from "../../lib/http.js";
import { ctxOf } from "../../middleware/authenticate.js";

export const procurementRouter = Router();

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { principalLimit: 50000, quotationThreshold: 5000, minQuotations: 3, pettyCashFloat: 10000, pettyCashVoucherLimit: 2000 };
type Settings = typeof DEFAULT_SETTINGS;

async function settingsOf(tx: Tx, organizationId: string): Promise<Settings> {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(org.settings ?? "{}").procurement ?? {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: unknown) => Number(d ?? 0);
const todayDate = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

/** Financial year code "26-27" (April–March). */
function fyCode(d = new Date()) {
  const start = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
/** Purchase requisitions are numbered PR/26-27/0001 (older ones kept their IND/ numbers). */
async function nextNo(tx: Tx, prefix: "PR" | "PO" | "GRN", organizationId: string) {
  const start = `${prefix}/${fyCode()}/`;
  const where = { organizationId, no: { startsWith: start } };
  const count = prefix === "PR" ? await tx.indent.count({ where }) : prefix === "PO" ? await tx.purchaseOrder.count({ where }) : await tx.goodsReceipt.count({ where });
  return `${start}${String(count + 1).padStart(4, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD: "Waiting for HOD", PENDING_STORE: "Store check", PENDING_PRINCIPAL: "Waiting for Principal", PENDING_MANAGEMENT: "Waiting for Management",
  APPROVED_FOR_PURCHASE: "Getting quotations", PO_RAISED: "Ordered from vendor", GOODS_RECEIVED: "Received in store", COMPLETED: "Delivered", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
function requireStatus(indent: { status: string }, ...allowed: string[]) {
  if (!allowed.includes(indent.status)) throw new AppError(409, "WRONG_STEP", `This indent is "${STATUS_LABEL[indent.status] ?? indent.status}" — that step is not possible now.`);
}

const indentInclude = { lines: { orderBy: { lineNo: "asc" } }, events: { orderBy: { at: "asc" } } } as const;
type IndentRow = NonNullable<Awaited<ReturnType<typeof loadIndent>>>;
async function loadIndent(tx: Tx, id: string) {
  return tx.indent.findUnique({ where: { id }, include: indentInclude });
}
const purchaseEstimate = (i: IndentRow) => round2(i.lines.reduce((s, l) => s + (l.toPurchase ?? l.qty) * num(l.estRate), 0));

function indentOut(i: IndentRow) {
  return {
    id: i.id, no: i.no, branchId: i.branchId, status: i.status, statusLabel: STATUS_LABEL[i.status], requestedById: i.requestedById, requesterName: i.requesterName,
    department: i.department, location: i.location, purpose: i.purpose, priority: i.priority, neededBy: toDateString(i.neededBy), raisedOn: toDateString(i.createdAt),
    estimate: purchaseEstimate(i),
    lines: i.lines.map((l) => ({ lineNo: l.lineNo, name: l.name, qty: l.qty, unit: l.unit, estRate: num(l.estRate), inventoryItemId: l.inventoryItemId, category: l.category, issuedFromStock: l.issuedFromStock, toPurchase: l.toPurchase })),
    events: i.events.map((e) => ({ at: e.at, by: e.byName, role: e.role, action: e.action, remark: e.remark })),
  };
}

async function addEvent(tx: Tx, ctx: RequestContext, indentId: string, role: string, action: string, remark?: string | null, automatic = false) {
  await tx.indentEvent.create({ data: { organizationId: ctx.organizationId, indentId, byUserId: automatic ? null : ctx.userId, byName: automatic ? "System" : ctx.name, role, action, remark: remark || null } });
}

/** The caller's staff record (department, HOD position), if they are staff. */
async function staffOf(tx: Tx, userId: string) {
  const s = await tx.staff.findFirst({ where: { userId }, select: { id: true, branchId: true, department: true, profile: true } });
  if (!s) return null;
  let positions: string[] = [];
  try {
    positions = JSON.parse(s.profile ?? "{}").positions ?? [];
  } catch {
    positions = [];
  }
  return { ...s, isHod: positions.includes("Head of Department (HOD)") };
}

/** HOD (with a login) of a department in a branch. */
async function hodOf(tx: Tx, branchId: string, department: string) {
  const candidates = await tx.staff.findMany({ where: { branchId, department, status: "ACTIVE", userId: { not: null }, profile: { contains: "Head of Department (HOD)" } }, select: { userId: true, name: true } });
  return candidates[0] ?? null;
}

async function issueStock(tx: Tx, ctx: RequestContext, branchId: string, itemId: string, qty: number, note: string) {
  const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { branchId: true, quantity: true, name: true, unit: true } });
  if (!item || item.branchId !== branchId) throw badRequest("Choose a stock item of this branch.");
  if (item.quantity < qty) throw conflict(`${item.name}: only ${item.quantity} ${item.unit} in stock.`);
  await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: { decrement: qty } } });
  await tx.stockMovement.create({ data: { organizationId: ctx.organizationId, itemId, type: "OUT", quantity: qty, note, createdById: ctx.userId } });
}

function canSeeAll(ctx: RequestContext, branchId: string) {
  return ["procurement.store", "procurement.approve", "procurement.approve_management", "payables.manage"].some((p) => ctx.access.can(p, branchId) || ctx.access.can(p));
}
function need(ctx: RequestContext, permission: string, branchId: string) {
  if (!ctx.access.can(permission, branchId) && !ctx.access.can(permission)) throw forbidden();
}

async function indentFor(req: Request) {
  const ctx = ctxOf(req);
  return { ctx, id: idParam(req) };
}

// ── Indents ───────────────────────────────────────────────────────────────────

/** GET /procurement/indents?status= — store, approvers and accounts see the branch; others their own and (HODs) their department's. */
procurementRouter.get("/procurement/indents", async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ status: z.string().max(25).optional() }).parse(req.query);
  const branchIds = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const me = await staffOf(tx, ctx.userId);
    const all = await tx.indent.findMany({ where: { branchId: { in: branchIds }, ...(q.status ? { status: q.status } : {}) }, include: indentInclude, orderBy: { createdAt: "desc" }, take: 200 });
    const visible = all.filter((i) => canSeeAll(ctx, i.branchId) || i.requestedById === ctx.userId || (me?.isHod && me.department === i.department && me.branchId === i.branchId));
    const staff = await tx.staff.findMany({ where: { userId: { in: [...new Set(visible.map((i) => i.requestedById))] } }, select: { id: true, userId: true } });
    const pos = await tx.purchaseOrder.findMany({ where: { indentId: { in: visible.map((i) => i.id) }, status: { not: "CANCELLED" } }, select: { id: true, indentId: true } });
    return visible.map((i) => ({ ...indentOut(i), requesterStaffId: staff.find((s) => s.userId === i.requestedById)?.id ?? null, poId: pos.find((p) => p.indentId === i.id)?.id ?? null }));
  });
  res.json(rows);
});

procurementRouter.get("/procurement/indents/:id", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const indent = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    const me = await staffOf(tx, ctx.userId);
    if (!canSeeAll(ctx, i.branchId) && i.requestedById !== ctx.userId && !(me?.isHod && me.department === i.department)) throw notFound("Indent");
    return i;
  });
  res.json(indentOut(indent));
});

const lineInput = z.object({
  name: z.string().trim().min(2).max(200),
  qty: z.number().int().min(1).max(100000),
  unit: z.string().trim().min(1).max(20),
  estRate: z.number().min(0).max(10_000_000),
  inventoryItemId: z.string().uuid().optional(),
});

/** POST /procurement/indents — raise a requisition. Skips the HOD when the department has none or the HOD raised it. */
procurementRouter.post("/procurement/indents", async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: z.string().uuid().optional(),
    department: z.string().trim().min(2).max(100).optional(),
    location: z.string().trim().min(2).max(150),
    purpose: z.string().trim().min(3).max(1000),
    priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
    neededBy: dateOnly,
    lines: z.array(lineInput).min(1).max(30),
  }).parse(req.body);
  const branchId = targetBranch(ctx, "procurement.request", body.branchId);

  const indent = await withTenant(ctx.organizationId, async (tx) => {
    const me = await staffOf(tx, ctx.userId);
    const department = me?.department ?? body.department;
    if (!department) throw badRequest("Which department is this for?");
    const hod = await hodOf(tx, branchId, department);
    const skipHod = !hod || hod.userId === ctx.userId;
    const created = await tx.indent.create({
      data: {
        organizationId: ctx.organizationId, branchId, no: await nextNo(tx, "PR", ctx.organizationId), requestedById: ctx.userId, requesterName: ctx.name,
        department, location: body.location, purpose: body.purpose, priority: body.priority, neededBy: body.neededBy, status: skipHod ? "PENDING_STORE" : "PENDING_HOD",
        lines: { create: body.lines.map((l, n) => ({ organizationId: ctx.organizationId, lineNo: n, name: l.name, qty: l.qty, unit: l.unit, estRate: l.estRate, inventoryItemId: l.inventoryItemId ?? null })) },
      },
    });
    // the store raises PRs itself too (reorders); everyone else is a requester
    await addEvent(tx, ctx, created.id, ctx.access.can("procurement.store", branchId) ? "STORE" : "TEACHER", "Raised purchase requisition");
    if (skipHod) await addEvent(tx, ctx, created.id, "SYSTEM", "HOD step skipped", hod ? "Raised by the HOD" : `${department} department has no HOD — sent to store`, true);
    await audit(tx, ctx, { action: "CREATE", entity: "Indent", entityId: created.id, branchId, after: body });
    return loadIndent(tx, created.id);
  });
  res.status(201).json(indentOut(indent!));
});

const decisionInput = z.object({ approve: z.boolean(), remark: z.string().trim().max(1000).default("") }).refine((d) => d.approve || d.remark.length > 0, { message: "Give a reason for rejecting", path: ["remark"] });

procurementRouter.post("/procurement/indents/:id/cancel", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i || i.requestedById !== ctx.userId) throw notFound("Indent");
    requireStatus(i, "PENDING_HOD", "PENDING_STORE", "PENDING_PRINCIPAL", "PENDING_MANAGEMENT", "APPROVED_FOR_PURCHASE");
    await tx.indent.update({ where: { id }, data: { status: "CANCELLED" } });
    await addEvent(tx, ctx, id, "TEACHER", "Cancelled", reason);
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

/** POST /procurement/indents/:id/hod — only the HOD of the indent's department. */
procurementRouter.post("/procurement/indents/:id/hod", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const d = decisionInput.parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    const me = await staffOf(tx, ctx.userId);
    if (!me?.isHod || me.department !== i.department || me.branchId !== i.branchId) throw forbidden("Only the HOD of this department can decide.");
    requireStatus(i, "PENDING_HOD");
    await tx.indent.update({ where: { id }, data: { status: d.approve ? "PENDING_STORE" : "REJECTED" } });
    await addEvent(tx, ctx, id, "HOD", d.approve ? "Approved" : "Rejected", d.remark);
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

/** POST /procurement/indents/:id/store-check — issue from stock what is there; the rest goes for approval. */
procurementRouter.post("/procurement/indents/:id/store-check", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const body = z.object({
    lines: z.array(z.object({ issue: z.number().int().min(0), estRate: z.number().min(0), inventoryItemId: z.string().uuid().nullable().optional(), category: z.string().trim().max(60).optional() })),
    remark: z.string().trim().max(500).default(""),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.store", i.branchId);
    requireStatus(i, "PENDING_STORE");
    if (body.lines.length !== i.lines.length) throw badRequest("Decide every line.");
    // the store's own replenishment PR buys stock — issuing from that same stock would empty it
    if (i.events[0]?.role === "STORE" && body.lines.some((d) => d.issue > 0)) throw badRequest("This is the store's own reorder — nothing can be issued from stock; buy the full quantity.");
    let est = 0;
    const issued: string[] = [];
    for (const [n, l] of i.lines.entries()) {
      const d = body.lines[n];
      if (d.issue > l.qty) throw badRequest(`${l.name}: issue at most ${l.qty}.`);
      const itemId = d.inventoryItemId ?? l.inventoryItemId ?? null;
      if (d.issue > 0) {
        if (!itemId) throw badRequest(`${l.name}: choose the stock item to issue from.`);
        await issueStock(tx, ctx, i.branchId, itemId, d.issue, `Issued to ${i.location} — ${i.no}`);
        issued.push(`${d.issue} ${l.unit} ${l.name}`);
      }
      est += (l.qty - d.issue) * d.estRate;
      await tx.indentLine.update({ where: { id: l.id }, data: { issuedFromStock: d.issue, toPurchase: l.qty - d.issue, estRate: d.estRate, inventoryItemId: itemId, category: d.category ?? l.category } });
    }
    const toBuy = round2(est) > 0 || body.lines.some((d, n) => i.lines[n].qty - d.issue > 0);
    await tx.indent.update({ where: { id }, data: { status: toBuy ? "PENDING_PRINCIPAL" : "COMPLETED" } });
    const summary = [issued.length ? `Issued from stock: ${issued.join(", ")}` : "", toBuy ? `To purchase, est. ₹${round2(est).toLocaleString("en-IN")}` : "Everything issued from stock", body.remark].filter(Boolean).join(" · ");
    await addEvent(tx, ctx, id, "STORE", "Store check", summary);
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

/** POST /procurement/indents/:id/principal — above the limit an approval forwards it to Management. */
procurementRouter.post("/procurement/indents/:id/principal", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const d = decisionInput.parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.approve", i.branchId);
    requireStatus(i, "PENDING_PRINCIPAL");
    const over = purchaseEstimate(i) > (await settingsOf(tx, ctx.organizationId)).principalLimit;
    const status = !d.approve ? "REJECTED" : over ? "PENDING_MANAGEMENT" : "APPROVED_FOR_PURCHASE";
    await tx.indent.update({ where: { id }, data: { status } });
    await addEvent(tx, ctx, id, "PRINCIPAL", d.approve ? "Approved" : "Rejected", [d.remark, d.approve && over ? "Above the principal's limit — sent to Management." : ""].filter(Boolean).join(" "));
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

procurementRouter.post("/procurement/indents/:id/management", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const d = decisionInput.parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.approve_management", i.branchId);
    requireStatus(i, "PENDING_MANAGEMENT");
    await tx.indent.update({ where: { id }, data: { status: d.approve ? "APPROVED_FOR_PURCHASE" : "REJECTED" } });
    await addEvent(tx, ctx, id, "MANAGEMENT", d.approve ? "Approved" : "Rejected", d.remark);
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

// ── Vendors ───────────────────────────────────────────────────────────────────

const vendorInput = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(100).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN looks wrong").optional().or(z.literal("")),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN looks wrong").optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  bank: z.object({ bankName: z.string().trim().max(100), accountNo: z.string().trim().regex(/^\d{6,20}$/), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks wrong") }).optional(),
  tdsSection: z.enum(["NONE", "194C", "194J", "194I"]).default("194C"),
  isIndividual: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
type VendorRow = { id: string; code: string | null; name: string; category: string | null; gstin: string | null; pan: string | null; phone: string | null; email: string | null; address: string | null; bankAccount: string | null; tdsSection: string; isIndividual: boolean; isActive: boolean };
function vendorOut(v: VendorRow) {
  const bank = decryptJson<{ bankName: string; accountNo: string; ifsc: string }>(v.bankAccount);
  return { ...v, bankAccount: undefined, bank: bank ? { bankName: bank.bankName, ifsc: bank.ifsc, accountLast4: bank.accountNo.slice(-4) } : null };
}

procurementRouter.get("/procurement/vendors", async (req, res) => {
  const ctx = ctxOf(req);
  if (!["procurement.store", "payables.manage", "procurement.approve", "procurement.approve_management"].some((p) => ctx.access.canAnywhere(p))) throw forbidden();
  const vendors = await withTenant(ctx.organizationId, (tx) => tx.vendor.findMany({ orderBy: { name: "asc" } }));
  res.json(vendors.map(vendorOut));
});

procurementRouter.post("/procurement/vendors", async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere("procurement.store")) throw forbidden();
  const { bank, ...v } = vendorInput.parse(req.body);
  const vendor = await withTenant(ctx.organizationId, async (tx) => {
    // vendor code: the next number in the V-0001 series
    const codes = await tx.vendor.findMany({ where: { code: { startsWith: "V-" } }, select: { code: true } });
    const code = `V-${String(codes.reduce((m, c) => Math.max(m, Number(c.code?.slice(2)) || 0), 0) + 1).padStart(4, "0")}`;
    const created = await tx.vendor.create({ data: { ...v, code, gstin: v.gstin || null, pan: v.pan || null, email: v.email || null, organizationId: ctx.organizationId, bankAccount: bank ? encryptJson(bank) : null } });
    await audit(tx, ctx, { action: "CREATE", entity: "Vendor", entityId: created.id, after: { ...v, bank: bank ? "set" : undefined } });
    return created;
  });
  res.status(201).json(vendorOut(vendor));
});

procurementRouter.put("/procurement/vendors/:id", async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  if (!ctx.access.canAnywhere("procurement.store")) throw forbidden();
  const { bank, ...v } = vendorInput.parse(req.body);
  const vendor = await withTenant(ctx.organizationId, async (tx) => {
    if (!(await tx.vendor.findUnique({ where: { id } }))) throw notFound("Vendor");
    const updated = await tx.vendor.update({ where: { id }, data: { ...v, gstin: v.gstin || null, pan: v.pan || null, email: v.email || null, ...(bank ? { bankAccount: encryptJson(bank) } : {}) } });
    await audit(tx, ctx, { action: "UPDATE", entity: "Vendor", entityId: id, after: { ...v, bank: bank ? "changed" : undefined } });
    return updated;
  });
  res.json(vendorOut(vendor));
});

// ── Quotations & purchase orders ──────────────────────────────────────────────

const quoteTotal = (lines: { lineNo: number; rate: unknown }[], gst: number, indent: IndentRow) => {
  const sub = indent.lines.reduce((s, l) => s + (l.toPurchase ?? 0) * num(lines.find((x) => x.lineNo === l.lineNo)?.rate), 0);
  return round2(sub * (1 + gst / 100));
};

procurementRouter.get("/procurement/indents/:id/quotations", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    if (!canSeeAll(ctx, i.branchId)) throw forbidden();
    const qs = await tx.quotation.findMany({ where: { indentId: id }, include: { lines: true } });
    const vendors = await tx.vendor.findMany({ where: { id: { in: qs.map((q) => q.vendorId) } }, select: { id: true, name: true } });
    return qs.map((q) => ({ id: q.id, vendorId: q.vendorId, vendor: vendors.find((v) => v.id === q.vendorId)?.name, gstPercent: num(q.gstPercent), deliveryDays: q.deliveryDays, validTill: toDateString(q.validTill), notes: q.notes, lines: q.lines.map((l) => ({ lineNo: l.lineNo, rate: num(l.rate) })), total: quoteTotal(q.lines, num(q.gstPercent), i) }));
  });
  res.json(out);
});

/** GET /procurement/quotations — every quotation of the branch's indents (store, approvers, accounts). */
procurementRouter.get("/procurement/quotations", async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = (ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith()).filter((b) => canSeeAll(ctx, b));
  if (!branchIds.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const indentIds = (await tx.indent.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })).map((i) => i.id);
    const qs = await tx.quotation.findMany({ where: { indentId: { in: indentIds } }, include: { lines: true }, orderBy: { receivedAt: "asc" } });
    return qs.map((q) => ({ id: q.id, indentId: q.indentId, vendorId: q.vendorId, gstPercent: num(q.gstPercent), deliveryDays: q.deliveryDays, validTill: toDateString(q.validTill), receivedOn: toDateString(q.receivedAt), notes: q.notes, lines: q.lines.map((l) => ({ lineNo: l.lineNo, rate: num(l.rate) })) }));
  });
  res.json(out);
});

/** DELETE /procurement/quotations/:id — while quotations are still being collected. */
procurementRouter.delete("/procurement/quotations/:id", async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id } });
    if (!q) throw notFound("Quotation");
    const i = (await loadIndent(tx, q.indentId))!;
    need(ctx, "procurement.store", i.branchId);
    requireStatus(i, "APPROVED_FOR_PURCHASE");
    await tx.quotationLine.deleteMany({ where: { quotationId: id } });
    await tx.quotation.delete({ where: { id } });
  });
  res.status(204).end();
});

procurementRouter.post("/procurement/indents/:id/quotations", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const body = z.object({
    vendorId: z.string().uuid(), gstPercent: z.number().min(0).max(28), deliveryDays: z.number().int().min(0).max(365), validTill: dateOnly, notes: z.string().trim().max(500).optional(),
    lines: z.array(z.object({ lineNo: z.number().int().min(0), rate: z.number().positive() })).min(1),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.store", i.branchId);
    requireStatus(i, "APPROVED_FOR_PURCHASE");
    const vendor = await tx.vendor.findUnique({ where: { id: body.vendorId } });
    if (!vendor?.isActive) throw badRequest("Choose an active vendor.");
    if (await tx.quotation.count({ where: { indentId: id, vendorId: body.vendorId } })) throw conflict(`${vendor.name} has already quoted for this indent.`);
    for (const l of i.lines.filter((x) => (x.toPurchase ?? 0) > 0)) if (!body.lines.some((q) => q.lineNo === l.lineNo)) throw badRequest(`Enter ${vendor.name}'s rate for ${l.name}.`);
    return tx.quotation.create({ data: { organizationId: ctx.organizationId, indentId: id, vendorId: body.vendorId, gstPercent: body.gstPercent, deliveryDays: body.deliveryDays, validTill: body.validTill, notes: body.notes ?? null, lines: { create: body.lines.map((l) => ({ organizationId: ctx.organizationId, lineNo: l.lineNo, rate: l.rate })) } } });
  });
  res.status(201).json({ id: out.id });
});

/** POST /procurement/indents/:id/purchase-order — needs a reason when fewer quotations than required or not the lowest. */
procurementRouter.post("/procurement/indents/:id/purchase-order", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const body = z.object({ quotationId: z.string().uuid(), note: z.string().trim().max(500).default("") }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.store", i.branchId);
    requireStatus(i, "APPROVED_FOR_PURCHASE");
    const quotes = await tx.quotation.findMany({ where: { indentId: id }, include: { lines: true } });
    const chosen = quotes.find((q) => q.id === body.quotationId.toLowerCase());
    if (!chosen) throw badRequest("Choose one of this indent's quotations.");
    if (chosen.validTill < todayDate()) throw badRequest("That quotation has expired — ask the vendor for a fresh one.");
    const settings = await settingsOf(tx, ctx.organizationId);
    const totals = quotes.map((q) => quoteTotal(q.lines, num(q.gstPercent), i));
    const total = quoteTotal(chosen.lines, num(chosen.gstPercent), i);
    if (purchaseEstimate(i) >= settings.quotationThreshold && quotes.length < settings.minQuotations && !body.note) throw badRequest(`Purchases from ₹${settings.quotationThreshold} need ${settings.minQuotations} quotations — add more or write why fewer are enough.`);
    if (total > Math.min(...totals) && !body.note) throw badRequest("This is not the lowest quotation — write why it was chosen.");
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.organizationId, branchId: i.branchId, no: await nextNo(tx, "PO", ctx.organizationId), indentId: id, vendorId: chosen.vendorId, quotationId: chosen.id,
        orderDate: todayDate(), deliveryBy: new Date(todayDate().getTime() + chosen.deliveryDays * 86_400_000), gstPercent: chosen.gstPercent, status: "SENT", selectionNote: body.note || null, createdById: ctx.userId,
        lines: { create: i.lines.filter((l) => (l.toPurchase ?? 0) > 0).map((l) => ({ organizationId: ctx.organizationId, lineNo: l.lineNo, name: l.name, qty: l.toPurchase!, unit: l.unit, rate: chosen.lines.find((x) => x.lineNo === l.lineNo)!.rate })) },
      },
    });
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: chosen.vendorId }, select: { name: true } });
    await tx.indent.update({ where: { id }, data: { status: "PO_RAISED" } });
    await addEvent(tx, ctx, id, "PURCHASE", `Purchase order ${po.no} sent`, `${vendor.name} · ₹${total.toLocaleString("en-IN")}${body.note ? ` · ${body.note}` : ""}`);
    await audit(tx, ctx, { action: "CREATE", entity: "PurchaseOrder", entityId: po.id, branchId: i.branchId, after: { no: po.no, total } });
    return po;
  });
  res.status(201).json({ id: out.id, no: out.no });
});

procurementRouter.get("/procurement/purchase-orders", async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = [...new Set([...scopeBranchesSafe(ctx, "procurement.store"), ...scopeBranchesSafe(ctx, "payables.manage")])];
  if (!branchIds.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const pos = await tx.purchaseOrder.findMany({ where: { branchId: { in: branchIds } }, include: { lines: { orderBy: { lineNo: "asc" } } }, orderBy: { orderDate: "desc" }, take: 200 });
    // where each order stands in Accounts: the store follows its GRNs through billing and payment
    const bills = await tx.vendorBill.findMany({ where: { poId: { in: pos.map((p) => p.id) } }, orderBy: { createdAt: "asc" } });
    const payments = await tx.vendorPayment.findMany({ where: { billId: { in: bills.map((b) => b.id) } }, select: { billId: true, paidOn: true, net: true } });
    return pos.map((p) => ({
      ...p, gstPercent: num(p.gstPercent), orderDate: toDateString(p.orderDate), deliveryBy: toDateString(p.deliveryBy), lines: p.lines.map((l) => ({ ...l, rate: num(l.rate) })),
      bills: bills.filter((b) => b.poId === p.id).map((b) => {
        const paid = payments.find((x) => x.billId === b.id);
        return { billNo: b.billNo, billDate: toDateString(b.billDate), total: num(b.total), status: b.status, paidOn: paid ? toDateString(paid.paidOn) : null };
      }),
    }));
  });
  res.json(out);
});
function scopeBranchesSafe(ctx: RequestContext, permission: string) {
  try {
    return scopeBranches(ctx, permission);
  } catch {
    return [];
  }
}

/** POST /procurement/purchase-orders/:id/cancel — only while nothing has been received; the indent goes back to quotations. */
procurementRouter.post("/procurement/purchase-orders/:id/cancel", async (req, res) => {
  const ctx = ctxOf(req);
  const poId = idParam(req);
  const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw notFound("Purchase order");
    need(ctx, "procurement.store", po.branchId);
    if (po.status !== "SENT") throw conflict("Only a purchase order with nothing received yet can be cancelled.");
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED" } });
    await tx.indent.update({ where: { id: po.indentId }, data: { status: "APPROVED_FOR_PURCHASE" } });
    await addEvent(tx, ctx, po.indentId, "PURCHASE", `Purchase order ${po.no} cancelled`, reason);
    await audit(tx, ctx, { action: "UPDATE", entity: "PurchaseOrder", entityId: poId, branchId: po.branchId, before: { status: po.status }, after: { status: "CANCELLED", reason } });
  });
  res.json({ ok: true });
});

/** GET /procurement/receipts — goods receipts (GRNs) of the branch. */
procurementRouter.get("/procurement/receipts", async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = [...new Set([...scopeBranchesSafe(ctx, "procurement.store"), ...scopeBranchesSafe(ctx, "payables.manage")])];
  if (!branchIds.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const grns = await tx.goodsReceipt.findMany({ where: { branchId: { in: branchIds } }, include: { lines: true }, orderBy: { receivedOn: "desc" }, take: 500 });
    const users = new Map((await tx.user.findMany({ where: { id: { in: [...new Set(grns.map((g) => g.receivedById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return grns.map((g) => ({ id: g.id, no: g.no, poId: g.poId, receivedOn: toDateString(g.receivedOn), receivedBy: users.get(g.receivedById) ?? "", checkedBy: g.checkedBy, challanNo: g.challanNo, lines: g.lines.map((l) => ({ lineNo: l.lineNo, received: l.received, accepted: l.accepted, rejectedReason: l.rejectedReason })) }));
  });
  res.json(out);
});

/** POST /procurement/purchase-orders/:id/receipts — goods receipt (GRN): accepted quantities go into stock. */
procurementRouter.post("/procurement/purchase-orders/:id/receipts", async (req, res) => {
  const ctx = ctxOf(req);
  const poId = idParam(req);
  const body = z.object({
    checkedBy: z.string().trim().min(2).max(150), challanNo: z.string().trim().min(1).max(60),
    lines: z.array(z.object({ lineNo: z.number().int().min(0), received: z.number().int().min(0), accepted: z.number().int().min(0), rejectedReason: z.string().trim().max(300).optional() })).min(1),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } });
    if (!po) throw notFound("Purchase order");
    need(ctx, "procurement.store", po.branchId);
    if (po.status !== "SENT" && po.status !== "PARTIALLY_RECEIVED") throw conflict("Nothing is pending on this purchase order.");
    const indent = (await loadIndent(tx, po.indentId))!;
    const used = body.lines.filter((l) => l.received > 0);
    if (!used.length) throw badRequest("Enter what was received.");
    for (const l of used) {
      const pl = po.lines.find((x) => x.lineNo === l.lineNo);
      if (!pl) throw badRequest("Unknown PO line.");
      if (l.received > pl.qty - pl.received) throw badRequest(`${pl.name}: only ${pl.qty - pl.received} still due.`);
      if (l.accepted > l.received) throw badRequest(`${pl.name}: accepted cannot exceed received.`);
      if (l.accepted < l.received && !l.rejectedReason) throw badRequest(`${pl.name}: say why some were rejected.`);
      // stock in (creates the inventory item the first time)
      if (l.accepted > 0) {
        const il = indent.lines.find((x) => x.lineNo === l.lineNo)!;
        let itemId = il.inventoryItemId;
        if (!itemId) {
          const item = await tx.inventoryItem.create({ data: { organizationId: ctx.organizationId, branchId: po.branchId, sku: `${po.no.replace(/\//g, "-")}-${l.lineNo}`, name: il.name, category: il.category ?? "General", unit: il.unit, location: indent.location, quantity: 0, minQuantity: 0, unitPrice: pl.rate, condition: "NEW" } });
          itemId = item.id;
          await tx.indentLine.update({ where: { id: il.id }, data: { inventoryItemId: itemId } });
        }
        await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: { increment: l.accepted } } });
        await tx.stockMovement.create({ data: { organizationId: ctx.organizationId, itemId, type: "IN", quantity: l.accepted, note: `${po.no} received`, createdById: ctx.userId } });
      }
      await tx.purchaseOrderLine.update({ where: { id: pl.id }, data: { received: { increment: l.received }, accepted: { increment: l.accepted } } });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { poId } });
    const complete = lines.every((l) => l.received >= l.qty);
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
    const grn = await tx.goodsReceipt.create({
      data: { organizationId: ctx.organizationId, branchId: po.branchId, no: await nextNo(tx, "GRN", ctx.organizationId), poId, receivedOn: todayDate(), receivedById: ctx.userId, checkedBy: body.checkedBy, challanNo: body.challanNo,
        lines: { create: used.map((l) => ({ organizationId: ctx.organizationId, lineNo: l.lineNo, received: l.received, accepted: l.accepted, rejectedReason: l.rejectedReason || null })) } },
    });
    if (complete) await tx.indent.update({ where: { id: po.indentId }, data: { status: "GOODS_RECEIVED" } });
    await addEvent(tx, ctx, po.indentId, "STORE", `Goods received — ${grn.no}`, `${used.reduce((s, l) => s + l.received, 0)} received, ${used.reduce((s, l) => s + l.accepted, 0)} accepted · checked by ${body.checkedBy}${complete ? "" : " · rest still due"}`);
    return grn;
  });
  res.status(201).json({ id: out.id, no: out.no });
});

/** POST /procurement/indents/:id/issue — hand the received goods to the requester (stock out) and close. */
procurementRouter.post("/procurement/indents/:id/issue", async (req, res) => {
  const { ctx, id } = await indentFor(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await loadIndent(tx, id);
    if (!i) throw notFound("Indent");
    need(ctx, "procurement.store", i.branchId);
    requireStatus(i, "GOODS_RECEIVED");
    const po = await tx.purchaseOrder.findFirstOrThrow({ where: { indentId: id, status: "RECEIVED" }, include: { lines: true } });
    for (const pl of po.lines.filter((l) => l.accepted > 0)) {
      const il = i.lines.find((x) => x.lineNo === pl.lineNo)!;
      await issueStock(tx, ctx, i.branchId, il.inventoryItemId!, pl.accepted, `Issued to ${i.location} — ${i.no}`);
    }
    await tx.indent.update({ where: { id }, data: { status: "COMPLETED" } });
    await addEvent(tx, ctx, id, "STORE", "Issued to requester", `Handed to ${i.location}`);
    return loadIndent(tx, id);
  });
  res.json(indentOut(out!));
});

// ── Vendor bills & payments ───────────────────────────────────────────────────

const TDS_RATE: Record<string, number> = { NONE: 0, "194C": 2, "194J": 10, "194I": 10 };
const TDS_THRESHOLD: Record<string, number> = { NONE: Infinity, "194C": 30000, "194J": 30000, "194I": 50000 };
function tdsFor(subtotal: number, vendor: { tdsSection: string; isIndividual: boolean }) {
  if (vendor.tdsSection === "NONE" || subtotal < TDS_THRESHOLD[vendor.tdsSection]) return { section: vendor.tdsSection, amount: 0 };
  const rate = vendor.tdsSection === "194C" && vendor.isIndividual ? 1 : TDS_RATE[vendor.tdsSection];
  return { section: vendor.tdsSection, amount: Math.round((subtotal * rate) / 100) };
}

procurementRouter.get("/payables/bills", async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = scopeBranches(ctx, "payables.manage");
  const bills = await withTenant(ctx.organizationId, (tx) => tx.vendorBill.findMany({ where: { branchId: { in: branchIds } }, orderBy: { createdAt: "desc" }, take: 200 }));
  res.json(bills.map((b) => ({ ...b, subtotal: num(b.subtotal), gst: num(b.gst), total: num(b.total), expected: num(b.expected), billDate: toDateString(b.billDate) })));
});

/** POST /payables/bills — three-way match: PO rate × accepted quantity (+ GST) − already billed vs this bill. */
procurementRouter.post("/payables/bills", async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ poId: z.string().uuid(), billNo: z.string().trim().min(1).max(60), billDate: dateOnly, subtotal: z.number().positive(), gst: z.number().min(0) }).parse(req.body);
  const bill = await withTenant(ctx.organizationId, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: body.poId }, include: { lines: true } });
    if (!po) throw notFound("Purchase order");
    need(ctx, "payables.manage", po.branchId);
    if (await tx.vendorBill.count({ where: { vendorId: po.vendorId, billNo: body.billNo } })) throw conflict("This bill number from this vendor is already entered.");
    const receivedSub = po.lines.reduce((s, l) => s + l.accepted * num(l.rate), 0);
    if (receivedSub <= 0) throw conflict("Nothing has been received against this PO yet — bills are entered after the goods receipt.");
    const billed = (await tx.vendorBill.findMany({ where: { poId: po.id, status: { not: "ON_HOLD" } }, select: { total: true } })).reduce((s, b) => s + num(b.total), 0);
    const expected = round2(receivedSub * (1 + num(po.gstPercent) / 100) - billed);
    const total = round2(body.subtotal + body.gst);
    const created = await tx.vendorBill.create({
      data: { organizationId: ctx.organizationId, branchId: po.branchId, poId: po.id, vendorId: po.vendorId, billNo: body.billNo, billDate: body.billDate, subtotal: body.subtotal, gst: body.gst, total, expected, status: Math.abs(total - expected) <= 1 ? "MATCHED" : "MISMATCH", enteredById: ctx.userId },
    });
    await audit(tx, ctx, { action: "CREATE", entity: "VendorBill", entityId: created.id, branchId: po.branchId, after: { ...body, expected, status: created.status } });
    return created;
  });
  res.status(201).json({ ...bill, subtotal: num(bill.subtotal), gst: num(bill.gst), total: num(bill.total), expected: num(bill.expected) });
});

procurementRouter.post("/payables/bills/:id/decision", async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ action: z.enum(["approve", "hold"]), note: z.string().trim().max(500).default("") }).parse(req.body);
  const bill = await withTenant(ctx.organizationId, async (tx) => {
    const b = await tx.vendorBill.findUnique({ where: { id } });
    if (!b) throw notFound("Bill");
    need(ctx, "payables.manage", b.branchId);
    if (b.status === "PAID") throw conflict("Already paid.");
    if (body.action === "approve" && b.status === "MISMATCH" && !body.note) throw badRequest("The bill does not match PO + GRN — write why it can still be paid.");
    const updated = await tx.vendorBill.update({ where: { id }, data: { status: body.action === "approve" ? "APPROVED" : "ON_HOLD", note: body.note || b.note } });
    await audit(tx, ctx, { action: "UPDATE", entity: "VendorBill", entityId: id, branchId: b.branchId, before: { status: b.status }, after: body });
    return updated;
  });
  res.json({ id: bill.id, status: bill.status });
});

/** POST /payables/bills/:id/pay — TDS withheld on the pre-GST amount; the expense is booked. */
procurementRouter.post("/payables/bills/:id/pay", async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ mode: z.enum(["NEFT", "CHEQUE", "UPI"]), reference: z.string().trim().min(3).max(60), paidOn: dateOnly }).parse(req.body);
  const payment = await withTenant(ctx.organizationId, async (tx) => {
    const b = await tx.vendorBill.findUnique({ where: { id } });
    if (!b) throw notFound("Bill");
    need(ctx, "payables.manage", b.branchId);
    if (b.status !== "MATCHED" && b.status !== "APPROVED") throw conflict(b.status === "PAID" ? "Already paid." : "Approve the bill first.");
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: b.vendorId } });
    const tds = tdsFor(num(b.subtotal), vendor);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: b.poId }, select: { no: true } });
    const expense = await tx.expense.create({
      data: { organizationId: ctx.organizationId, branchId: b.branchId, date: body.paidOn, category: "Purchases", description: `${po.no} · bill ${b.billNo}${tds.amount ? ` (TDS ${tds.section} ₹${tds.amount} withheld)` : ""}`, amount: b.total, paidTo: vendor.name, method: body.mode === "NEFT" ? "BANK_TRANSFER" : body.mode, createdById: ctx.userId },
    });
    const p = await tx.vendorPayment.create({
      data: { organizationId: ctx.organizationId, branchId: b.branchId, billId: id, vendorId: vendor.id, paidOn: body.paidOn, gross: b.total, tdsSection: tds.section, tds: tds.amount, net: round2(num(b.total) - tds.amount), mode: body.mode, reference: body.reference, expenseId: expense.id, paidById: ctx.userId },
    });
    await tx.vendorBill.update({ where: { id }, data: { status: "PAID" } });
    await audit(tx, ctx, { action: "CREATE", entity: "VendorPayment", entityId: p.id, branchId: b.branchId, after: { bill: b.billNo, gross: num(b.total), tds: tds.amount } });
    return p;
  });
  res.status(201).json({ ...payment, gross: num(payment.gross), tds: num(payment.tds), net: num(payment.net), paidOn: toDateString(payment.paidOn) });
});

/** GET /payables/payments — vendor payments of the branch. */
procurementRouter.get("/payables/payments", async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = scopeBranches(ctx, "payables.manage");
  const rows = await withTenant(ctx.organizationId, (tx) => tx.vendorPayment.findMany({ where: { branchId: { in: branchIds } }, orderBy: { paidOn: "desc" }, take: 500 }));
  res.json(rows.map((p) => ({ id: p.id, billId: p.billId, vendorId: p.vendorId, paidOn: toDateString(p.paidOn), gross: num(p.gross), tdsSection: p.tdsSection, tds: num(p.tds), net: num(p.net), mode: p.mode, reference: p.reference })));
});

// ── Petty cash ────────────────────────────────────────────────────────────────

async function pettyBalance(tx: Tx, branchId: string) {
  const rows = await tx.pettyCashVoucher.findMany({ where: { branchId }, select: { kind: true, amount: true } });
  return round2(rows.reduce((s, r) => s + (r.kind === "TOPUP" ? 1 : -1) * num(r.amount), 0));
}

procurementRouter.get("/petty-cash", async (req, res) => {
  const ctx = ctxOf(req);
  const branchId = targetBranch(ctx, "payables.manage");
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const vouchers = await tx.pettyCashVoucher.findMany({ where: { branchId }, orderBy: { voucherDate: "desc" }, take: 200 });
    const users = new Map((await tx.user.findMany({ where: { id: { in: [...new Set(vouchers.map((v) => v.approvedById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      balance: await pettyBalance(tx, branchId),
      settings: await settingsOf(tx, ctx.organizationId),
      vouchers: vouchers.map((v) => ({ ...v, amount: num(v.amount), voucherDate: toDateString(v.voucherDate), approvedBy: users.get(v.approvedById) ?? "" })),
    };
  });
  res.json(out);
});

procurementRouter.post("/petty-cash/spend", async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ purpose: z.string().trim().min(3).max(300), paidTo: z.string().trim().min(2).max(150), category: z.string().trim().max(40), amount: z.number().positive(), date: dateOnly }).parse(req.body);
  const branchId = targetBranch(ctx, "payables.manage");
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await settingsOf(tx, ctx.organizationId);
    if (body.amount > s.pettyCashVoucherLimit) throw badRequest(`Petty cash is for spends up to ₹${s.pettyCashVoucherLimit} — raise an indent for bigger purchases.`);
    if (body.amount > (await pettyBalance(tx, branchId))) throw conflict("Not enough cash in the petty cash box — top it up first.");
    const expense = await tx.expense.create({ data: { organizationId: ctx.organizationId, branchId, date: body.date, category: body.category, description: `Petty cash: ${body.purpose}`, amount: body.amount, paidTo: body.paidTo, method: "CASH", createdById: ctx.userId } });
    return tx.pettyCashVoucher.create({ data: { organizationId: ctx.organizationId, branchId, voucherDate: body.date, kind: "SPEND", purpose: body.purpose, paidTo: body.paidTo, category: body.category, amount: body.amount, expenseId: expense.id, approvedById: ctx.userId } });
  });
  res.status(201).json({ ...out, amount: num(out.amount) });
});

procurementRouter.post("/petty-cash/top-up", async (req, res) => {
  const ctx = ctxOf(req);
  const branchId = targetBranch(ctx, "payables.manage");
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await settingsOf(tx, ctx.organizationId);
    const need = round2(s.pettyCashFloat - (await pettyBalance(tx, branchId)));
    if (need <= 0) throw conflict("The petty cash box is already full.");
    return tx.pettyCashVoucher.create({ data: { organizationId: ctx.organizationId, branchId, voucherDate: todayDate(), kind: "TOPUP", purpose: "Top-up to float (cash withdrawn from bank)", paidTo: "Petty cash box", amount: need, approvedById: ctx.userId } });
  });
  res.status(201).json({ ...out, amount: num(out.amount) });
});

// ── Settings ──────────────────────────────────────────────────────────────────

procurementRouter.get("/procurement/settings", async (req, res) => {
  const ctx = ctxOf(req);
  res.json(await withTenant(ctx.organizationId, (tx) => settingsOf(tx, ctx.organizationId)));
});

procurementRouter.put("/procurement/settings", async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere("procurement.approve_management")) throw forbidden();
  const body = z.object({
    principalLimit: z.number().int().min(0), quotationThreshold: z.number().int().min(0), minQuotations: z.number().int().min(1).max(5),
    pettyCashFloat: z.number().int().min(0), pettyCashVoucherLimit: z.number().int().min(0),
  }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
    const settings = JSON.parse(org.settings ?? "{}");
    settings.procurement = { ...DEFAULT_SETTINGS, ...(settings.procurement ?? {}), ...body };
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: JSON.stringify(settings) } });
    await audit(tx, ctx, { action: "UPDATE", entity: "ProcurementSettings", after: body });
    return settings.procurement as Settings;
  });
  res.json(out);
});
