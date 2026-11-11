import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { scopeBranches, targetBranch, type RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { expenseAccountForCategory, paymentLedgerLine, postJournal } from './ledger.js';

export const controlsRouter = Router();

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const amount = z.number().positive().max(100_000_000).refine((value) => Number(value.toFixed(2)) === value, 'Use up to two decimal places.');
const fiscalYearSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use financial-year format YYYY-YY.');
const uuid = z.string().uuid().transform((value) => value.toLowerCase());

function branchesForRead(ctx: RequestContext) {
  return scopeBranches(ctx, 'accounting.read');
}

function yearDates(fiscalYear: string) {
  const start = Number(fiscalYear.slice(0, 4));
  const end = start + 1;
  if (Number(fiscalYear.slice(-2)) !== end % 100) throw badRequest('The fiscal year must be an April–March financial year, such as 2026-27.');
  return { start: new Date(Date.UTC(start, 3, 1)), end: new Date(Date.UTC(end, 3, 1)) };
}

async function budgetSummary(tx: Tx, branchId: string, fiscalYear: string) {
  const dates = yearDates(fiscalYear);
  const budgets = await tx.departmentBudget.findMany({
    where: { branchId, fiscalYear, isActive: true }, orderBy: [{ department: 'asc' }, { category: 'asc' }],
  });
  const expenses = await tx.expense.findMany({
    where: { branchId, date: { gte: dates.start, lt: dates.end } },
    select: { department: true, category: true, amount: true },
  });
  const indents = await tx.indent.findMany({
    where: {
      branchId, createdAt: { gte: dates.start, lt: dates.end },
      status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
    },
    include: { lines: { select: { name: true, qty: true, estRate: true, category: true, toPurchase: true } } },
  });
  return budgets.map((budget) => {
    const spent = expenses.filter((expense) => expense.department === budget.department && (budget.category === 'All' || expense.category === budget.category))
      .reduce((sum, expense) => sum + money(expense.amount), 0);
    const committed = indents.filter((indent) => indent.department === budget.department).flatMap((indent) => indent.lines)
      .filter((line) => budget.category === 'All' || (line.category ?? 'Other') === budget.category)
      .reduce((sum, line) => sum + (line.toPurchase ?? line.qty) * money(line.estRate), 0);
    const allocated = money(budget.allocated);
    return {
      id: budget.id, branchId: budget.branchId, fiscalYear: budget.fiscalYear, department: budget.department,
      category: budget.category, allocated, spent: money(spent), committed: money(committed),
      available: money(allocated - spent - committed), hardStop: budget.hardStop,
    };
  });
}

controlsRouter.get('/accounts/budgets', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = branchesForRead(ctx);
  const fiscalYear = fiscalYearSchema.optional().parse(req.query.fiscalYear);
  const selectedYear = fiscalYear ?? (() => {
    const now = new Date();
    const start = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  })();
  yearDates(selectedYear);
  const budgets = await withTenant(ctx.organizationId, async (tx) => {
    const all = await Promise.all(branchIds.map((branchId) => budgetSummary(tx, branchId, selectedYear)));
    return all.flat();
  });
  res.json({ fiscalYear: selectedYear, budgets });
});

controlsRouter.put('/accounts/budgets', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: uuid.optional(), fiscalYear: fiscalYearSchema, department: z.string().trim().min(2).max(100),
    category: z.string().trim().min(1).max(60), allocated: z.number().min(0).max(100_000_000),
    hardStop: z.boolean().default(false),
  }).parse(req.body);
  const branchId = targetBranch(ctx, 'accounting.manage', body.branchId);
  yearDates(body.fiscalYear);
  const budget = await withTenant(ctx.organizationId, async (tx) => {
    const unique = { branchId_fiscalYear_department_category: { branchId, fiscalYear: body.fiscalYear, department: body.department, category: body.category } };
    const before = await tx.departmentBudget.findUnique({ where: { branchId_fiscalYear_department_category: unique.branchId_fiscalYear_department_category } });
    const row = before
      ? await tx.departmentBudget.update({ where: { id: before.id }, data: { allocated: body.allocated, hardStop: body.hardStop } })
      : await tx.departmentBudget.create({
        data: { id: randomUUID(), organizationId: ctx.organizationId, branchId, fiscalYear: body.fiscalYear, department: body.department, category: body.category, allocated: body.allocated, hardStop: body.hardStop, createdById: ctx.userId },
      });
    if (body.hardStop) {
      const current = (await budgetSummary(tx, branchId, body.fiscalYear)).find((candidate) => candidate.id === row.id);
      if (current && current.available < 0) {
        throw badRequest(`This hard-stop allocation is below current spend and commitments by ${money(Math.abs(current.available)).toLocaleString('en-IN')}.`);
      }
    }
    await audit(tx, ctx, {
      action: before ? 'UPDATE' : 'CREATE', entity: 'DepartmentBudget', entityId: row.id, branchId,
      before: before ? { allocated: money(before.allocated), hardStop: before.hardStop } : undefined,
      after: { fiscalYear: body.fiscalYear, department: body.department, category: body.category, allocated: body.allocated, hardStop: body.hardStop },
    });
    return row;
  });
  res.status(200).json({ id: budget.id, ...body, branchId });
});

controlsRouter.get('/accounts/grants', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = branchesForRead(ctx);
  const funds = await withTenant(ctx.organizationId, (tx) => tx.grantFund.findMany({
    where: { branchId: { in: branchIds } },
    include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
  }));
  res.json(funds.map((fund) => {
    const expenses = fund.transactions.filter((transaction) => transaction.kind === 'EXPENSE').reduce((sum, transaction) => sum + money(transaction.amount), 0);
    const receipts = fund.transactions.filter((transaction) => transaction.kind === 'RECEIPT').reduce((sum, transaction) => sum + money(transaction.amount), 0);
    return {
      id: fund.id, branchId: fund.branchId, code: fund.code, name: fund.name, donor: fund.donor, restriction: fund.restriction,
      awarded: money(fund.awarded), received: money(fund.received), spent: money(expenses), unspent: money(receipts - expenses),
      startDate: toDateString(fund.startDate), endDate: toDateString(fund.endDate), status: fund.status,
      transactions: fund.transactions.map((transaction) => ({
        id: transaction.id, date: toDateString(transaction.transactionDate), kind: transaction.kind,
        description: transaction.description, amount: money(transaction.amount), sourceType: transaction.sourceType,
      })),
    };
  }));
});

controlsRouter.post('/accounts/grants', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: uuid.optional(), code: z.string().trim().min(2).max(40), name: z.string().trim().min(2).max(200),
    donor: z.string().trim().min(2).max(200), restriction: z.string().trim().min(3).max(500),
    awarded: amount, received: z.number().min(0).max(100_000_000).default(0),
    startDate: dateOnly, endDate: dateOnly,
  }).refine((value) => value.endDate >= value.startDate, { message: 'End date must be on or after start date.', path: ['endDate'] })
    .refine((value) => value.received <= value.awarded, { message: 'Received funds cannot exceed the award.', path: ['received'] }).parse(req.body);
  const branchId = targetBranch(ctx, 'accounting.manage', body.branchId);
  const result = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.grantFund.findFirst({ where: { branchId, code: body.code } })) throw conflict('A grant with this code already exists in this branch.');
    const fund = await tx.grantFund.create({
      data: {
        id: randomUUID(), organizationId: ctx.organizationId, branchId, code: body.code, name: body.name,
        donor: body.donor, restriction: body.restriction, awarded: body.awarded, received: body.received,
        startDate: body.startDate, endDate: body.endDate, status: 'ACTIVE', createdById: ctx.userId,
      },
    });
    if (body.received > 0) {
      const transaction = await tx.grantTransaction.create({
        data: {
          id: randomUUID(), organizationId: ctx.organizationId, branchId, grantFundId: fund.id,
          transactionDate: body.startDate, kind: 'RECEIPT', description: 'Initial grant funds received',
          amount: body.received, sourceType: 'GRANT_FUND', sourceId: fund.id, createdById: ctx.userId,
        },
      });
      await postJournal(tx, ctx, {
        branchId, date: body.startDate, description: `Restricted grant received · ${body.code}`,
        sourceType: 'GRANT_RECEIPT', sourceId: transaction.id,
        lines: [
          { ...await paymentLedgerLine(tx, branchId, 'BANK_TRANSFER', 'GRANT'), description: fund.name, debit: body.received },
          { accountCode: '2300', description: `Restricted grant · ${body.code}`, credit: body.received },
        ],
      });
    }
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'GrantFund', entityId: fund.id, branchId,
      after: { code: fund.code, name: fund.name, awarded: money(fund.awarded), received: money(fund.received), status: fund.status },
    });
    return fund;
  });
  res.status(201).json({ id: result.id, ...body, branchId, status: result.status, spent: 0, unspent: body.received });
});

controlsRouter.post('/accounts/grants/:grantId/transactions', async (req, res) => {
  const ctx = ctxOf(req);
  const grantId = idParam(req, 'grantId');
  const body = z.object({
    date: dateOnly, kind: z.enum(['RECEIPT', 'EXPENSE']), description: z.string().trim().min(3).max(300),
    amount, category: z.string().trim().min(1).max(40).optional(), method: z.enum(['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH']).optional(),
    reference: z.string().trim().max(100).optional(),
  }).refine((value) => value.kind === 'RECEIPT' || (!!value.category && !!value.method), {
    message: 'Grant spending needs an expense category and payment method.',
    path: ['category'],
  }).parse(req.body);
  const result = await withTenant(ctx.organizationId, async (tx) => {
    const initialFund = await tx.grantFund.findUnique({ where: { id: grantId }, select: { branchId: true } });
    if (!initialFund) throw notFound('Grant');
    if (!ctx.access.can('accounting.manage', initialFund.branchId)) throw forbidden();
    await tx.grantFund.update({ where: { id: grantId }, data: { received: { increment: 0 } } });
    const fund = await tx.grantFund.findUnique({ where: { id: grantId }, include: { transactions: { select: { kind: true, amount: true } } } });
    if (!fund) throw notFound('Grant');
    if (fund.status !== 'ACTIVE') throw conflict('Only active grants can receive transactions.');
    if (body.date < fund.startDate || body.date > fund.endDate) throw badRequest('Transaction date must be within the grant period.');
    const spent = fund.transactions.filter((transaction) => transaction.kind === 'EXPENSE').reduce((sum, transaction) => sum + money(transaction.amount), 0);
    const received = fund.transactions.filter((transaction) => transaction.kind === 'RECEIPT').reduce((sum, transaction) => sum + money(transaction.amount), 0);
    if (body.kind === 'RECEIPT' && money(received + body.amount) > money(fund.awarded)) throw badRequest('Grant receipts cannot exceed the awarded amount.');
    if (body.kind === 'EXPENSE' && body.amount > money(received - spent)) throw badRequest('This spend exceeds the grant funds received and still available.');

    const transaction = await tx.grantTransaction.create({
      data: {
        id: randomUUID(), organizationId: ctx.organizationId, branchId: fund.branchId, grantFundId: fund.id,
        transactionDate: body.date, kind: body.kind, description: body.description, amount: body.amount,
        sourceType: 'MANUAL', createdById: ctx.userId,
      },
    });
    if (body.kind === 'RECEIPT') {
      await tx.grantFund.update({ where: { id: fund.id }, data: { received: money(money(fund.received) + body.amount) } });
      await postJournal(tx, ctx, {
        branchId: fund.branchId, date: body.date, description: `Grant receipt · ${fund.code}`,
        sourceType: 'GRANT_RECEIPT', sourceId: transaction.id,
        lines: [
          { ...await paymentLedgerLine(tx, fund.branchId, 'BANK_TRANSFER', 'GRANT'), description: body.description, debit: body.amount },
          { accountCode: '2300', description: `Restricted grant · ${fund.code}`, credit: body.amount },
        ],
      });
    } else {
      const expense = await tx.expense.create({
        data: {
          id: randomUUID(), organizationId: ctx.organizationId, branchId: fund.branchId, date: body.date,
          category: body.category!, description: body.description, amount: body.amount, paidTo: fund.name,
          method: body.method!, grantFundId: fund.id, createdById: ctx.userId,
        },
      });
      await postJournal(tx, ctx, {
        branchId: fund.branchId, date: body.date, description: `Restricted grant spend · ${fund.code}`,
        sourceType: 'GRANT_EXPENSE', sourceId: transaction.id,
        lines: [
          { accountCode: expenseAccountForCategory(body.category!), description: body.description, debit: body.amount },
          { ...await paymentLedgerLine(tx, fund.branchId, body.method ?? 'BANK_TRANSFER', 'GRANT'), description: `Grant spend · ${fund.code}`, credit: body.amount },
          { accountCode: '2300', description: `Release restricted grant · ${fund.code}`, debit: body.amount },
          { accountCode: '4050', description: `Grant income recognized · ${fund.code}`, credit: body.amount },
        ],
      });
      await tx.grantTransaction.update({ where: { id: transaction.id }, data: { sourceId: expense.id, sourceType: 'EXPENSE' } });
    }
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'GrantTransaction', entityId: transaction.id, branchId: fund.branchId,
      after: { kind: transaction.kind, amount: money(transaction.amount), transactionDate: toDateString(transaction.transactionDate), category: body.category, method: body.method },
    });
    return transaction;
  });
  res.status(201).json({ id: result.id, grantFundId: grantId, date: toDateString(result.transactionDate), kind: result.kind, description: result.description, amount: money(result.amount) });
});

controlsRouter.get('/accounts/grants/:grantId/utilization', async (req, res) => {
  const ctx = ctxOf(req);
  const grantId = idParam(req, 'grantId');
  const report = await withTenant(ctx.organizationId, async (tx) => {
    const fund = await tx.grantFund.findUnique({
      where: { id: grantId }, include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!fund) throw notFound('Grant');
    if (!ctx.access.can('accounting.read', fund.branchId)) throw forbidden();
    const spent = fund.transactions.filter((transaction) => transaction.kind === 'EXPENSE');
    const received = fund.transactions.filter((transaction) => transaction.kind === 'RECEIPT');
    return {
      code: fund.code, name: fund.name, donor: fund.donor, restriction: fund.restriction,
      period: { from: toDateString(fund.startDate), to: toDateString(fund.endDate) },
      awarded: money(fund.awarded), received: money(received.reduce((sum, transaction) => sum + money(transaction.amount), 0)),
      utilized: money(spent.reduce((sum, transaction) => sum + money(transaction.amount), 0)),
      transactions: fund.transactions.map((transaction) => ({
        date: toDateString(transaction.transactionDate), kind: transaction.kind, description: transaction.description,
        amount: money(transaction.amount), sourceType: transaction.sourceType,
      })),
    };
  });
  res.json(report);
});
