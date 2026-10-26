import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { memberBranches } from '../../lib/scope.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Library, inventory, transport and hostel.
 * Each is run by its manager (library.manage, inventory.manage, transport.manage, hostel.manage);
 * principals and admins (reports.view) can read them. Everyone in a branch can see the inventory
 * catalogue (teachers pick items for requisitions).
 */
export const facilitiesRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

/** Branches readable for a facility: where the user manages it or views reports. */
function readable(ctx: RequestContext, permission: string) {
  const ok = (b: string) => ctx.access.can(permission, b) || ctx.access.can('reports.view', b);
  const ids = ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
  if (!ids.length) throw forbidden();
  return ids;
}
const assertManage = (ctx: RequestContext, permission: string, branchId: string) => {
  if (!ctx.access.can(permission, branchId)) throw forbidden();
};

/** Organization-level settings section (JSON in Organization.settings). */
async function readSettings(tx: Tx, organizationId: string, key: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const all = (parseJson(org.settings) ?? {}) as Record<string, unknown>;
  return { all, section: (all[key] ?? null) as Record<string, unknown> | null };
}

// ═════════════════════════════════════════════════════════════════════════════
// Library
// ═════════════════════════════════════════════════════════════════════════════

const bookInput = z.object({
  title: z.string().trim().min(1).max(300), author: z.string().trim().min(1).max(200), isbn: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().min(1).max(50), publisher: z.string().trim().max(150).nullable().optional(), edition: z.string().trim().max(50).nullable().optional(),
  publishYear: z.number().int().min(1000).max(2100).nullable().optional(), totalCopies: z.number().int().min(0).max(10_000), rack: z.string().trim().max(20).nullable().optional(),
  branchId: uuid.optional(),
});

/** GET /library — books and this year's loans (with fines). */
facilitiesRouter.get('/library', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = readable(ctx, 'library.manage');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const [books, loans, settings] = await Promise.all([
      tx.book.findMany({ where: { branchId: { in: branchIds } }, orderBy: { title: 'asc' } }),
      tx.bookLoan.findMany({ where: { branchId: { in: branchIds }, OR: [{ returnDate: null }, { issueDate: { gte: year.startDate } }] }, orderBy: { issueDate: 'desc' } }),
      readSettings(tx, ctx.organizationId, 'library'),
    ]);
    return {
      finePerDay: Number(settings.section?.finePerDay ?? 5), loanDays: Number(settings.section?.loanDays ?? 14),
      books: books.map(({ organizationId: _o, ...b }) => b),
      loans: loans.map((l) => ({ id: l.id, bookId: l.bookId, studentId: l.studentId, staffId: l.staffId, issueDate: toDateString(l.issueDate), dueDate: toDateString(l.dueDate), returnDate: toDateString(l.returnDate), finePaid: money(l.finePaid) })),
    };
  });
  res.json(out);
});

/** POST /library/books — needs library.manage. */
facilitiesRouter.post('/library/books', async (req, res) => {
  const ctx = ctxOf(req);
  const body = bookInput.parse(req.body);
  const branchId = targetBranch(ctx, 'library.manage', body.branchId);
  const book = await withTenant(ctx.organizationId, async (tx) => {
    const { branchId: _b, ...data } = body;
    const b = await tx.book.create({ data: { ...data, organizationId: ctx.organizationId, branchId } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Book', entityId: b.id, branchId, after: { title: b.title } });
    return b;
  });
  res.status(201).json(book);
});

/** PATCH /library/books/:id — copies cannot drop below those on loan. */
facilitiesRouter.patch('/library/books/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = bookInput.omit({ branchId: true }).partial().parse(req.body);
  const book = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.book.findUnique({ where: { id } });
    if (!before) throw notFound('Book');
    assertManage(ctx, 'library.manage', before.branchId);
    if (body.totalCopies !== undefined) {
      const out = await tx.bookLoan.count({ where: { bookId: id, returnDate: null } });
      if (body.totalCopies < out) throw badRequest(`${out} copies are on loan — the total cannot be less than that.`);
    }
    const b = await tx.book.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Book', entityId: id, branchId: before.branchId, before: { title: before.title, totalCopies: before.totalCopies }, after: body });
    return b;
  });
  res.json(book);
});

/** DELETE /library/books/:id — only when no copy is out; its loan history goes with it. */
facilitiesRouter.delete('/library/books/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const b = await tx.book.findUnique({ where: { id } });
    if (!b) throw notFound('Book');
    assertManage(ctx, 'library.manage', b.branchId);
    if (await tx.bookLoan.count({ where: { bookId: id, returnDate: null } })) throw badRequest('Return all issued copies before deleting this book.');
    await tx.bookLoan.deleteMany({ where: { bookId: id } });
    await tx.book.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Book', entityId: id, branchId: b.branchId, before: { title: b.title } });
  });
  res.status(204).end();
});

/** POST /library/loans — issue a book to a student. */
facilitiesRouter.post('/library/loans', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ bookId: uuid, studentId: uuid, issueDate: dateOnly, dueDate: dateOnly }).parse(req.body);
  if (body.dueDate < body.issueDate) throw badRequest('The due date must be after the issue date.');
  const loan = await withTenant(ctx.organizationId, async (tx) => {
    const book = await tx.book.findUnique({ where: { id: body.bookId } });
    if (!book) throw notFound('Book');
    assertManage(ctx, 'library.manage', book.branchId);
    const student = await tx.student.findUnique({ where: { id: body.studentId }, select: { branchId: true, status: true } });
    if (!student || student.branchId !== book.branchId) throw badRequest('This student is not in this branch.');
    if (student.status !== 'ACTIVE') throw badRequest('Books can be issued to current students only.');
    const out = await tx.bookLoan.count({ where: { bookId: book.id, returnDate: null } });
    if (out >= book.totalCopies) throw conflict(`No copies of “${book.title}” are available.`);
    if (await tx.bookLoan.count({ where: { bookId: book.id, studentId: body.studentId, returnDate: null } })) throw conflict('This student already has this book.');
    const l = await tx.bookLoan.create({ data: { organizationId: ctx.organizationId, branchId: book.branchId, bookId: book.id, studentId: body.studentId, issueDate: body.issueDate, dueDate: body.dueDate } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'BookLoan', entityId: l.id, branchId: book.branchId, after: { book: book.title } });
    return { id: l.id, bookId: l.bookId, studentId: l.studentId, staffId: null, issueDate: toDateString(l.issueDate), dueDate: toDateString(l.dueDate), returnDate: null, finePaid: 0 };
  });
  res.status(201).json(loan);
});

/** POST /library/loans/:id/return — records the return and the fine (days late × fine per day). */
facilitiesRouter.post('/library/loans/:id/return', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const l = await tx.bookLoan.findUnique({ where: { id } });
    if (!l) throw notFound('Loan');
    assertManage(ctx, 'library.manage', l.branchId);
    if (l.returnDate) throw conflict('This book was already returned.');
    const finePerDay = Number((await readSettings(tx, ctx.organizationId, 'library')).section?.finePerDay ?? 5);
    const daysLate = Math.max(0, Math.floor((todayUtc().getTime() - l.dueDate.getTime()) / 86_400_000));
    const fine = daysLate * finePerDay;
    await tx.bookLoan.update({ where: { id }, data: { returnDate: todayUtc(), finePaid: fine } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'BookLoan', entityId: id, branchId: l.branchId, after: { returned: true, fine } });
    return { id, returnDate: toDateString(todayUtc()), finePaid: fine };
  });
  res.json(out);
});

// ═════════════════════════════════════════════════════════════════════════════
// Inventory
// ═════════════════════════════════════════════════════════════════════════════

const CONDITIONS = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
const itemInput = z.object({
  sku: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(60), unit: z.string().trim().min(1).max(20),
  location: z.string().trim().min(1).max(100), quantity: z.number().int().min(0).max(10_000_000), minQuantity: z.number().int().min(0).max(10_000_000),
  unitPrice: z.number().min(0).max(100_000_000), condition: z.string().toUpperCase().pipe(z.enum(CONDITIONS)), branchId: uuid.optional(),
});
type ItemRow = { id: string; branchId: string; sku: string; name: string; category: string; unit: string; location: string; quantity: number; minQuantity: number; unitPrice: unknown; condition: string };
const itemOut = (i: ItemRow, lastUpdated: Date | null) => ({ id: i.id, branchId: i.branchId, sku: i.sku, name: i.name, category: i.category, unit: i.unit, location: i.location, quantity: i.quantity, minQuantity: i.minQuantity, unitPrice: money(i.unitPrice), condition: i.condition, lastUpdated: toDateString(lastUpdated) });

/** GET /inventory/items — the catalogue (everyone in the branch). */
facilitiesRouter.get('/inventory/items', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = memberBranches(ctx);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const items = await tx.inventoryItem.findMany({ where: { branchId: { in: branchIds } }, orderBy: { name: 'asc' } });
    const last = await tx.stockMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _max: { createdAt: true } });
    const lastOf = new Map(last.map((l) => [l.itemId, l._max.createdAt]));
    return items.map((i) => itemOut(i, lastOf.get(i.id) ?? null));
  });
  res.json(out);
});

/** GET /inventory/movements — stock in / out history (inventory.manage or reports.view). */
facilitiesRouter.get('/inventory/movements', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = readable(ctx, 'inventory.manage');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const rows = await tx.stockMovement.findMany({ where: { item: { branchId: { in: branchIds } } }, orderBy: { createdAt: 'desc' }, take: 2000 });
    const users = new Map((await tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((m) => ({ id: m.id, itemId: m.itemId, type: m.type, quantity: m.quantity, note: m.note, by: users.get(m.createdById) ?? '', date: toDateString(m.createdAt) }));
  });
  res.json(out);
});

/** POST /inventory/items — needs inventory.manage. Opening stock is recorded as a stock-in. */
facilitiesRouter.post('/inventory/items', async (req, res) => {
  const ctx = ctxOf(req);
  const body = itemInput.parse(req.body);
  const branchId = targetBranch(ctx, 'inventory.manage', body.branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.inventoryItem.count({ where: { branchId, sku: body.sku } })) throw conflict(`SKU ${body.sku} is already used.`);
    const { branchId: _b, ...data } = body;
    const i = await tx.inventoryItem.create({ data: { ...data, organizationId: ctx.organizationId, branchId } });
    if (i.quantity > 0) await tx.stockMovement.create({ data: { organizationId: ctx.organizationId, itemId: i.id, type: 'IN', quantity: i.quantity, note: 'Opening stock', createdById: ctx.userId } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'InventoryItem', entityId: i.id, branchId, after: { sku: i.sku, name: i.name } });
    return itemOut(i, new Date());
  });
  res.status(201).json(out);
});

/** PATCH /inventory/items/:id — details only; quantity changes go through stock movements. */
facilitiesRouter.patch('/inventory/items/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = itemInput.omit({ branchId: true, quantity: true }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.inventoryItem.findUnique({ where: { id } });
    if (!before) throw notFound('Item');
    assertManage(ctx, 'inventory.manage', before.branchId);
    if (body.sku && body.sku !== before.sku && (await tx.inventoryItem.count({ where: { branchId: before.branchId, sku: body.sku } }))) throw conflict(`SKU ${body.sku} is already used.`);
    const i = await tx.inventoryItem.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'InventoryItem', entityId: id, branchId: before.branchId, before: { name: before.name }, after: body });
    return itemOut(i, new Date());
  });
  res.json(out);
});

/** DELETE /inventory/items/:id — only items never used in purchases; their stock history goes with them. */
facilitiesRouter.delete('/inventory/items/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const i = await tx.inventoryItem.findUnique({ where: { id } });
    if (!i) throw notFound('Item');
    assertManage(ctx, 'inventory.manage', i.branchId);
    const used = await tx.indentLine.count({ where: { inventoryItemId: id } });
    if (used) throw badRequest('This item appears in requisitions — set its quantity to 0 instead of deleting it.');
    await tx.stockMovement.deleteMany({ where: { itemId: id } });
    await tx.inventoryItem.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'InventoryItem', entityId: id, branchId: i.branchId, before: { sku: i.sku, name: i.name } });
  });
  res.status(204).end();
});

/** POST /inventory/items/:id/movements — stock in or out. */
facilitiesRouter.post('/inventory/items/:id/movements', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ type: z.string().toUpperCase().pipe(z.enum(['IN', 'OUT'])), quantity: z.number().int().min(1).max(10_000_000), note: z.string().trim().max(300).nullable().optional() }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const i = await tx.inventoryItem.findUnique({ where: { id } });
    if (!i) throw notFound('Item');
    assertManage(ctx, 'inventory.manage', i.branchId);
    if (body.type === 'OUT' && body.quantity > i.quantity) throw badRequest(`Only ${i.quantity} ${i.unit} in stock.`);
    const updated = await tx.inventoryItem.update({ where: { id }, data: { quantity: { increment: body.type === 'IN' ? body.quantity : -body.quantity } } });
    const m = await tx.stockMovement.create({ data: { organizationId: ctx.organizationId, itemId: id, type: body.type, quantity: body.quantity, note: body.note ?? null, createdById: ctx.userId } });
    return { item: itemOut(updated, m.createdAt), movement: { id: m.id, itemId: id, type: m.type, quantity: m.quantity, note: m.note, by: ctx.name, date: toDateString(m.createdAt) } };
  });
  res.status(201).json(out);
});

/** GET /inventory/settings — categories, stores, units and alert levels (everyone in the school). */
facilitiesRouter.get('/inventory/settings', async (req, res) => {
  const ctx = ctxOf(req);
  memberBranches(ctx);
  const s = await withTenant(ctx.organizationId, (tx) => readSettings(tx, ctx.organizationId, 'inventory'));
  res.json(s.section);
});

/** PUT /inventory/settings — needs inventory.manage (or org.manage). */
facilitiesRouter.put('/inventory/settings', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('inventory.manage') && !ctx.access.can('org.manage')) throw forbidden();
  const body = z.object({
    categories: z.array(z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300) })).max(100),
    warehouses: z.array(z.string().trim().min(1).max(100)).max(50), units: z.array(z.string().trim().min(1).max(20)).max(50),
    users: z.array(z.object({ name: z.string().trim().min(1).max(150), role: z.string().trim().max(60) })).max(100),
    school: z.object({ name: z.string().max(200), address: z.string().max(500), phone: z.string().max(30), email: z.string().max(200) }),
    lowStockAlerts: z.boolean(), criticalPercent: z.number().int().min(1).max(100),
  }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const { all } = await readSettings(tx, ctx.organizationId, 'inventory');
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: JSON.stringify({ ...all, inventory: body }) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'InventorySettings', entityId: ctx.organizationId, after: { categories: body.categories.length } });
  });
  res.json(body);
});

// ═════════════════════════════════════════════════════════════════════════════
// Transport
// ═════════════════════════════════════════════════════════════════════════════

const VEHICLE_TYPES = ['BUS', 'MINI_BUS', 'VAN'] as const;

/** GET /transport — vehicles (with their driver) and routes (with stops and riders this year). */
facilitiesRouter.get('/transport', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = readable(ctx, 'transport.manage');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const [vehicles, routes] = await Promise.all([
      tx.vehicle.findMany({ where: { branchId: { in: branchIds } }, orderBy: { registrationNo: 'asc' } }),
      tx.transportRoute.findMany({ where: { branchId: { in: branchIds } }, include: { stops: { orderBy: { sortOrder: 'asc' }, include: { riders: { where: { academicYearId: year.id }, select: { studentId: true } } } } }, orderBy: { name: 'asc' } }),
    ]);
    const drivers = new Map((await tx.staff.findMany({ where: { id: { in: vehicles.map((v) => v.driverStaffId).filter((x): x is string => !!x) } }, select: { id: true, name: true, phone: true } })).map((d) => [d.id, d]));
    return {
      vehicles: vehicles.map((v) => ({ id: v.id, registrationNo: v.registrationNo, type: v.type, capacity: v.capacity, driverStaffId: v.driverStaffId, driverName: v.driverStaffId ? drivers.get(v.driverStaffId)?.name ?? '' : '', driverPhone: v.driverStaffId ? drivers.get(v.driverStaffId)?.phone ?? '' : '', insuranceExpiry: toDateString(v.insuranceExpiry), fitnessExpiry: toDateString(v.fitnessExpiry) })),
      routes: routes.map((r) => ({ id: r.id, name: r.name, vehicleId: r.vehicleId, monthlyFee: money(r.monthlyFee), pickupTime: r.pickupTime, stops: r.stops.map((s) => ({ id: s.id, name: s.name, riders: s.riders.map((x) => x.studentId) })) })),
    };
  });
  res.json(out);
});

/** The driver's staff record: an existing staff member with that name, or a new driver record. */
async function driverFor(tx: Tx, ctx: RequestContext, branchId: string, name: string | null | undefined, phone: string | null | undefined) {
  if (!name?.trim()) return null;
  const existing = await tx.staff.findFirst({ where: { branchId, name: name.trim(), status: { not: 'RESIGNED' } } });
  if (existing) {
    if (phone && phone !== existing.phone) await tx.staff.update({ where: { id: existing.id }, data: { phone } });
    return existing.id;
  }
  const count = await tx.staff.count({ where: { employeeCode: { startsWith: 'DRV' } } });
  let code = `DRV${String(count + 1).padStart(3, '0')}`;
  while (await tx.staff.count({ where: { employeeCode: code } })) code = `DRV${String(Number(code.slice(3)) + 1).padStart(3, '0')}`;
  const s = await tx.staff.create({ data: { organizationId: ctx.organizationId, branchId, employeeCode: code, name: name.trim(), phone: phone || null, staffType: 'NON_TEACHING', designation: 'Driver', department: 'Transport', status: 'ACTIVE' } });
  return s.id;
}

const vehicleInput = z.object({
  registrationNo: z.string().trim().toUpperCase().min(4).max(20), type: z.string().toUpperCase().transform((t) => t.replace(/\s+/g, '_')).pipe(z.enum(VEHICLE_TYPES)),
  capacity: z.number().int().min(1).max(100), driverName: z.string().trim().max(150).nullable().optional(), driverPhone: z.string().trim().max(20).nullable().optional(),
  insuranceExpiry: dateOnly, fitnessExpiry: dateOnly, branchId: uuid.optional(),
});

/** POST /transport/vehicles — needs transport.manage. */
facilitiesRouter.post('/transport/vehicles', async (req, res) => {
  const ctx = ctxOf(req);
  const body = vehicleInput.parse(req.body);
  const branchId = targetBranch(ctx, 'transport.manage', body.branchId);
  const v = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.vehicle.count({ where: { registrationNo: body.registrationNo } })) throw conflict(`${body.registrationNo} is already registered.`);
    const created = await tx.vehicle.create({ data: { organizationId: ctx.organizationId, branchId, registrationNo: body.registrationNo, type: body.type, capacity: body.capacity, insuranceExpiry: body.insuranceExpiry, fitnessExpiry: body.fitnessExpiry, driverStaffId: await driverFor(tx, ctx, branchId, body.driverName, body.driverPhone) } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Vehicle', entityId: created.id, branchId, after: { registrationNo: body.registrationNo } });
    return created;
  });
  res.status(201).json({ id: v.id });
});

/** PATCH /transport/vehicles/:id — needs transport.manage. */
facilitiesRouter.patch('/transport/vehicles/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = vehicleInput.omit({ branchId: true }).partial().parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.vehicle.findUnique({ where: { id } });
    if (!before) throw notFound('Vehicle');
    assertManage(ctx, 'transport.manage', before.branchId);
    const { driverName, driverPhone, ...cols } = body;
    if (cols.registrationNo && cols.registrationNo !== before.registrationNo && (await tx.vehicle.count({ where: { registrationNo: cols.registrationNo } }))) throw conflict(`${cols.registrationNo} is already registered.`);
    const driverStaffId = driverName !== undefined ? await driverFor(tx, ctx, before.branchId, driverName, driverPhone) : undefined;
    await tx.vehicle.update({ where: { id }, data: { ...cols, ...(driverStaffId !== undefined ? { driverStaffId } : {}) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Vehicle', entityId: id, branchId: before.branchId, before: { registrationNo: before.registrationNo }, after: body });
  });
  res.json({ ok: true });
});

/** DELETE /transport/vehicles/:id — routes using it are left without a vehicle. */
facilitiesRouter.delete('/transport/vehicles/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id } });
    if (!v) throw notFound('Vehicle');
    assertManage(ctx, 'transport.manage', v.branchId);
    await tx.transportRoute.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } });
    await tx.vehicle.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Vehicle', entityId: id, branchId: v.branchId, before: { registrationNo: v.registrationNo } });
  });
  res.status(204).end();
});

const routeInput = z.object({
  name: z.string().trim().min(1).max(60), vehicleId: uuid.nullable().optional(), monthlyFee: z.number().min(0).max(100_000),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'), stops: z.array(z.string().trim().min(1).max(100)).min(1).max(40), branchId: uuid.optional(),
});

/** Replaces a route's stops by name, keeping stops that have riders. */
async function setStops(tx: Tx, ctx: RequestContext, routeId: string, names: string[]) {
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw badRequest('A stop appears twice on the route.');
  const existing = await tx.routeStop.findMany({ where: { routeId }, include: { _count: { select: { riders: true } } } });
  for (const s of existing) {
    if (names.some((n) => n.toLowerCase() === s.name.toLowerCase())) continue;
    if (s._count.riders) throw badRequest(`Students board at “${s.name}” — move them before removing the stop.`);
    await tx.routeStop.delete({ where: { id: s.id } });
  }
  for (const [i, name] of names.entries()) {
    const s = existing.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (s) await tx.routeStop.update({ where: { id: s.id }, data: { name, sortOrder: i + 1 } });
    else await tx.routeStop.create({ data: { organizationId: ctx.organizationId, routeId, name, sortOrder: i + 1 } });
  }
}

/** POST /transport/routes — needs transport.manage. */
facilitiesRouter.post('/transport/routes', async (req, res) => {
  const ctx = ctxOf(req);
  const body = routeInput.parse(req.body);
  const branchId = targetBranch(ctx, 'transport.manage', body.branchId);
  const r = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.transportRoute.count({ where: { branchId, name: body.name } })) throw conflict(`A route named ${body.name} already exists.`);
    if (body.vehicleId && !(await tx.vehicle.count({ where: { id: body.vehicleId, branchId } }))) throw badRequest('Unknown vehicle.');
    const created = await tx.transportRoute.create({ data: { organizationId: ctx.organizationId, branchId, name: body.name, vehicleId: body.vehicleId ?? null, monthlyFee: body.monthlyFee, pickupTime: body.pickupTime } });
    await setStops(tx, ctx, created.id, body.stops);
    await audit(tx, ctx, { action: 'CREATE', entity: 'TransportRoute', entityId: created.id, branchId, after: { name: body.name, stops: body.stops } });
    return created;
  });
  res.status(201).json({ id: r.id });
});

/** PATCH /transport/routes/:id — needs transport.manage. */
facilitiesRouter.patch('/transport/routes/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = routeInput.omit({ branchId: true }).partial().parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.transportRoute.findUnique({ where: { id } });
    if (!before) throw notFound('Route');
    assertManage(ctx, 'transport.manage', before.branchId);
    if (body.vehicleId && !(await tx.vehicle.count({ where: { id: body.vehicleId, branchId: before.branchId } }))) throw badRequest('Unknown vehicle.');
    const { stops, ...cols } = body;
    await tx.transportRoute.update({ where: { id }, data: cols });
    if (stops) await setStops(tx, ctx, id, stops);
    await audit(tx, ctx, { action: 'UPDATE', entity: 'TransportRoute', entityId: id, branchId: before.branchId, before: { name: before.name }, after: body });
  });
  res.json({ ok: true });
});

/** DELETE /transport/routes/:id — only a route nobody rides this year. */
facilitiesRouter.delete('/transport/routes/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const r = await tx.transportRoute.findUnique({ where: { id } });
    if (!r) throw notFound('Route');
    assertManage(ctx, 'transport.manage', r.branchId);
    if (await tx.transportAllocation.count({ where: { stop: { routeId: id } } })) throw badRequest('Students are allocated to this route — move them first.');
    await tx.routeStop.deleteMany({ where: { routeId: id } });
    await tx.transportRoute.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'TransportRoute', entityId: id, branchId: r.branchId, before: { name: r.name } });
  });
  res.status(204).end();
});

// ═════════════════════════════════════════════════════════════════════════════
// Hostel
// ═════════════════════════════════════════════════════════════════════════════

/** GET /hostel — rooms, current residents and outpasses. */
facilitiesRouter.get('/hostel', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = readable(ctx, 'hostel.manage');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const rooms = await tx.hostelRoom.findMany({ where: { branchId: { in: branchIds } }, include: { allocations: { where: { toDate: null } } }, orderBy: [{ block: 'asc' }, { number: 'asc' }] });
    const passes = await tx.outpass.findMany({ where: { branchId: { in: branchIds } }, orderBy: { createdAt: 'desc' }, take: 1000 });
    return {
      rooms: rooms.map((r) => ({ id: r.id, block: r.block, number: r.number, capacity: r.capacity, type: r.type })),
      residents: rooms.flatMap((r) => r.allocations.map((a) => ({ studentId: a.studentId, roomId: r.id, since: toDateString(a.fromDate) }))),
      outpasses: passes.map((o) => ({ id: o.id, studentId: o.studentId, fromDate: toDateString(o.fromDate), toDate: toDateString(o.toDate), reason: o.reason, status: o.status, createdAt: toDateString(o.createdAt) })),
    };
  });
  res.json(out);
});

/** POST /hostel/allocations — puts a student in a room (moving them out of any other). Checks capacity and boys / girls. */
facilitiesRouter.post('/hostel/allocations', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ studentId: uuid, roomId: uuid }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const room = await tx.hostelRoom.findUnique({ where: { id: body.roomId }, include: { allocations: { where: { toDate: null } } } });
    if (!room) throw notFound('Room');
    assertManage(ctx, 'hostel.manage', room.branchId);
    const student = await tx.student.findUnique({ where: { id: body.studentId }, select: { branchId: true, gender: true, status: true } });
    if (!student || student.branchId !== room.branchId || student.status !== 'ACTIVE') throw badRequest('This student is not a current student of this branch.');
    if (room.allocations.some((a) => a.studentId === body.studentId)) return;
    if (room.allocations.length >= room.capacity) throw conflict(`Room ${room.block}-${room.number} is full.`);
    if ((room.type === 'BOYS' && student.gender === 'FEMALE') || (room.type === 'GIRLS' && student.gender === 'MALE')) throw badRequest(`Room ${room.block}-${room.number} is for ${room.type.toLowerCase()}.`);
    await tx.hostelAllocation.updateMany({ where: { studentId: body.studentId, toDate: null }, data: { toDate: todayUtc() } });
    await tx.hostelAllocation.create({ data: { organizationId: ctx.organizationId, roomId: room.id, studentId: body.studentId, fromDate: todayUtc() } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'HostelAllocation', entityId: body.studentId, branchId: room.branchId, after: { room: `${room.block}-${room.number}` } });
  });
  res.status(201).json({ ok: true });
});

/** POST /hostel/residents/:studentId/vacate — the student leaves the hostel. */
facilitiesRouter.post('/hostel/residents/:studentId/vacate', async (req, res) => {
  const ctx = ctxOf(req);
  const studentId = idParam(req, 'studentId');
  await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.hostelAllocation.findFirst({ where: { studentId, toDate: null }, include: { room: { select: { branchId: true } } } });
    if (!a) throw notFound('Resident');
    assertManage(ctx, 'hostel.manage', a.room.branchId);
    await tx.hostelAllocation.update({ where: { id: a.id }, data: { toDate: todayUtc() } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'HostelAllocation', entityId: a.id, branchId: a.room.branchId, after: { vacated: true } });
  });
  res.json({ ok: true });
});

/** POST /hostel/outpasses — a request for a resident to go home. */
facilitiesRouter.post('/hostel/outpasses', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ studentId: uuid, fromDate: dateOnly, toDate: dateOnly, reason: z.string().trim().min(2).max(300) }).parse(req.body);
  if (body.toDate < body.fromDate) throw badRequest('The return date must be on or after the leaving date.');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.hostelAllocation.findFirst({ where: { studentId: body.studentId, toDate: null }, include: { room: { select: { branchId: true } } } });
    if (!a) throw badRequest('This student does not live in the hostel.');
    assertManage(ctx, 'hostel.manage', a.room.branchId);
    const o = await tx.outpass.create({ data: { organizationId: ctx.organizationId, branchId: a.room.branchId, studentId: body.studentId, fromDate: body.fromDate, toDate: body.toDate, reason: body.reason, status: 'PENDING' } });
    return { id: o.id, studentId: o.studentId, fromDate: toDateString(o.fromDate), toDate: toDateString(o.toDate), reason: o.reason, status: o.status, createdAt: toDateString(o.createdAt) };
  });
  res.status(201).json(out);
});

/** PATCH /hostel/outpasses/:id — approve / reject a pending pass; mark an approved pass returned. */
facilitiesRouter.patch('/hostel/outpasses/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.string().toUpperCase().pipe(z.enum(['APPROVED', 'REJECTED', 'RETURNED'])) }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const o = await tx.outpass.findUnique({ where: { id } });
    if (!o) throw notFound('Outpass');
    assertManage(ctx, 'hostel.manage', o.branchId);
    const allowed = body.status === 'RETURNED' ? o.status === 'APPROVED' : o.status === 'PENDING';
    if (!allowed) throw conflict(`A ${o.status.toLowerCase()} outpass cannot be marked ${body.status.toLowerCase()}.`);
    await tx.outpass.update({ where: { id }, data: { status: body.status, decidedById: body.status === 'RETURNED' ? o.decidedById : ctx.userId } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Outpass', entityId: id, branchId: o.branchId, before: { status: o.status }, after: body });
  });
  res.json({ ok: true });
});

/**
 * GET /inventory/analysis?months=6 — stock analysis for the store and the principal:
 *  - valuation by category;
 *  - ABC analysis on consumption value over the last 12 months (A = top 70 %, B = next 20 %, C = the rest);
 *  - movement: fast (issued in the last 30 days), slow (31–90 days), non-moving (nothing issued in 90 days);
 *  - monthly consumption for the last `months` months;
 *  - days of stock cover and what to reorder (enough for two months of use, at least twice the minimum).
 */
facilitiesRouter.get('/inventory/analysis', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ months: z.coerce.number().int().min(3).max(24).default(6) }).parse(req.query);
  const branchIds = readable(ctx, 'inventory.manage');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const items = await tx.inventoryItem.findMany({ where: { branchId: { in: branchIds } } });
    const since = new Date(Date.now() - 365 * 86_400_000);
    const moves = await tx.stockMovement.findMany({ where: { itemId: { in: items.map((i) => i.id) }, createdAt: { gte: since } }, select: { itemId: true, type: true, quantity: true, createdAt: true } });
    const now = Date.now();
    const rows = items.map((i) => {
      const outs = moves.filter((m) => m.itemId === i.id && m.type === 'OUT');
      const ins = moves.filter((m) => m.itemId === i.id && m.type === 'IN');
      const issuedYear = outs.reduce((t, m) => t + m.quantity, 0);
      const issued90 = outs.filter((m) => now - m.createdAt.getTime() <= 90 * 86_400_000).reduce((t, m) => t + m.quantity, 0);
      const lastOut = outs.reduce<Date | null>((d, m) => (!d || m.createdAt > d ? m.createdAt : d), null);
      const daysSinceOut = lastOut ? Math.floor((now - lastOut.getTime()) / 86_400_000) : null;
      const dailyUse = issued90 / 90;
      const unitPrice = money(i.unitPrice);
      const monthlyUse = Math.round(dailyUse * 30 * 10) / 10;
      const target = Math.max(i.minQuantity * 2, Math.ceil(monthlyUse * 2));
      return {
        id: i.id, sku: i.sku, name: i.name, category: i.category, unit: i.unit, location: i.location, quantity: i.quantity, minQuantity: i.minQuantity, unitPrice,
        value: Math.round(i.quantity * unitPrice), consumptionValue: Math.round(issuedYear * unitPrice), issuedLastYear: issuedYear, receivedLastYear: ins.reduce((t, m) => t + m.quantity, 0),
        monthlyUse, daysOfCover: dailyUse > 0 ? Math.floor(i.quantity / dailyUse) : null,
        movement: daysSinceOut === null || daysSinceOut > 90 ? 'NON_MOVING' : daysSinceOut <= 30 ? 'FAST' : 'SLOW',
        lastIssued: lastOut ? toDateString(lastOut) : null,
        reorderQty: i.quantity < i.minQuantity || (dailyUse > 0 && i.quantity / dailyUse < 30) ? Math.max(0, target - i.quantity) : 0,
        abc: 'C' as 'A' | 'B' | 'C',
      };
    });
    // ABC on consumption value
    const totalConsumption = rows.reduce((t, x) => t + x.consumptionValue, 0);
    let running = 0;
    for (const x of [...rows].sort((a, b) => b.consumptionValue - a.consumptionValue)) {
      // an item belongs to the class in which its consumption starts
      const before = totalConsumption ? running / totalConsumption : 1;
      running += x.consumptionValue;
      x.abc = x.consumptionValue > 0 && before < 0.7 ? 'A' : x.consumptionValue > 0 && before < 0.9 ? 'B' : 'C';
    }
    const months = Array.from({ length: q.months }, (_, k) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - (q.months - 1 - k));
      return d.toISOString().slice(0, 7);
    });
    const priceOf = new Map(items.map((i) => [i.id, money(i.unitPrice)]));
    const consumption = months.map((m) => ({
      month: m,
      issued: moves.filter((x) => x.type === 'OUT' && x.createdAt.toISOString().startsWith(m)).reduce((t, x) => t + x.quantity * (priceOf.get(x.itemId) ?? 0), 0),
      received: moves.filter((x) => x.type === 'IN' && x.createdAt.toISOString().startsWith(m)).reduce((t, x) => t + x.quantity * (priceOf.get(x.itemId) ?? 0), 0),
    })).map((c) => ({ ...c, issued: Math.round(c.issued), received: Math.round(c.received) }));
    const categories = [...new Set(rows.map((x) => x.category))].map((name) => {
      const inCat = rows.filter((x) => x.category === name);
      return { name, items: inCat.length, value: inCat.reduce((t, x) => t + x.value, 0), consumptionValue: inCat.reduce((t, x) => t + x.consumptionValue, 0) };
    }).sort((a, b) => b.value - a.value);
    const count = (k: 'abc' | 'movement', v: string) => rows.filter((x) => x[k] === v).length;
    return {
      totals: {
        items: rows.length, stockValue: rows.reduce((t, x) => t + x.value, 0), consumptionValue: totalConsumption,
        lowStock: rows.filter((x) => x.quantity < x.minQuantity).length, toReorder: rows.filter((x) => x.reorderQty > 0).length,
        deadStockValue: rows.filter((x) => x.movement === 'NON_MOVING').reduce((t, x) => t + x.value, 0),
      },
      abc: { A: count('abc', 'A'), B: count('abc', 'B'), C: count('abc', 'C') },
      movement: { FAST: count('movement', 'FAST'), SLOW: count('movement', 'SLOW'), NON_MOVING: count('movement', 'NON_MOVING') },
      categories, consumption, items: rows.sort((a, b) => b.consumptionValue - a.consumptionValue || b.value - a.value),
    };
  });
  res.json(out);
});
