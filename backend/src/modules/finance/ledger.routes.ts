import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { scopeBranches, targetBranch, type RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';

export const ledgerRouter = Router();

const categories = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const;
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const DEFAULT_ACCOUNTS: { code: string; name: string; category: typeof categories[number] }[] = [
  { code: '1000', name: 'Cash on Hand', category: 'ASSET' },
  { code: '1010', name: 'Operating Bank Account', category: 'ASSET' },
  { code: '1020', name: 'Card / Gateway Clearing', category: 'ASSET' },
  { code: '1100', name: 'Fee Receivables', category: 'ASSET' },
  { code: '1110', name: 'Staff Salary Advances', category: 'ASSET' },
  { code: '1200', name: 'Refundable Deposits Receivable', category: 'ASSET' },
  { code: '2000', name: 'Vendor Payables', category: 'LIABILITY' },
  { code: '2100', name: 'Statutory Deductions Payable', category: 'LIABILITY' },
  { code: '2200', name: 'Student Refundable Deposits', category: 'LIABILITY' },
  { code: '2300', name: 'Restricted Grant Funds', category: 'LIABILITY' },
  { code: '3000', name: 'Trust / Capital Funds', category: 'EQUITY' },
  { code: '4000', name: 'Tuition Fee Income', category: 'INCOME' },
  { code: '4010', name: 'Transport Fee Income', category: 'INCOME' },
  { code: '4020', name: 'Hostel Fee Income', category: 'INCOME' },
  { code: '4030', name: 'Other Fee Income', category: 'INCOME' },
  { code: '4040', name: 'Late Fee Income', category: 'INCOME' },
  { code: '4050', name: 'Restricted Grant Income', category: 'INCOME' },
  { code: '5000', name: 'Salaries and Wages', category: 'EXPENSE' },
  { code: '5010', name: 'Utilities', category: 'EXPENSE' },
  { code: '5020', name: 'Repairs and Maintenance', category: 'EXPENSE' },
  { code: '5030', name: 'Supplies and Printing', category: 'EXPENSE' },
  { code: '5040', name: 'Transport Expenses', category: 'EXPENSE' },
  { code: '5050', name: 'Other Operating Expenses', category: 'EXPENSE' },
];

function requireRead(ctx: RequestContext) {
  const branches = scopeBranches(ctx, 'accounting.read');
  if (!branches.length) throw forbidden();
  return branches;
}

function requireManage(ctx: RequestContext, branchId?: string) {
  const branch = targetBranch(ctx, 'accounting.manage', branchId);
  return branch;
}

async function accountsFor(tx: Tx, branchIds: string[]) {
  return tx.ledgerAccount.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: [{ code: 'asc' }],
  });
}

ledgerRouter.get('/accounts/ledger/accounts', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = requireRead(ctx);
  const rows = await withTenant(ctx.organizationId, (tx) => accountsFor(tx, branchIds));
  res.json(rows.map((a) => ({
    id: a.id, branchId: a.branchId, code: a.code, name: a.name, category: a.category,
    parentId: a.parentId, isSystem: a.isSystem, isActive: a.isActive,
  })));
});

ledgerRouter.post('/accounts/ledger/accounts/setup', async (req, res) => {
  const ctx = ctxOf(req);
  const requestedBranch = req.body?.branchId ? uuid.parse(req.body.branchId) : ctx.activeBranchId ?? undefined;
  const branchId = requireManage(ctx, requestedBranch);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, code: true } });
    if (!branch) throw notFound('Branch');
    const existing = await tx.ledgerAccount.count({ where: { branchId } });
    if (existing) throw conflict('This branch already has a chart of accounts.');

    await tx.ledgerAccount.createMany({
      data: DEFAULT_ACCOUNTS.map((account) => ({
        id: randomUUID(), organizationId: ctx.organizationId, branchId, ...account, isSystem: true,
      })),
    });
    const created = await accountsFor(tx, [branchId]);
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'LedgerAccount', branchId,
      after: { setup: 'DEFAULT_CHART', accounts: created.length },
    });
    return created;
  });
  res.status(201).json(rows.map((a) => ({
    id: a.id, branchId: a.branchId, code: a.code, name: a.name, category: a.category,
    parentId: a.parentId, isSystem: a.isSystem, isActive: a.isActive,
  })));
});

ledgerRouter.post('/accounts/ledger/accounts', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: uuid.optional(),
    code: z.string().trim().min(1).max(20),
    name: z.string().trim().min(1).max(120),
    category: z.enum(categories),
    parentId: uuid.nullable().optional(),
  }).parse(req.body);
  const branchId = requireManage(ctx, body.branchId);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    if (body.parentId) {
      const parent = await tx.ledgerAccount.findFirst({ where: { id: body.parentId, branchId } });
      if (!parent) throw badRequest('The parent account must belong to this branch.');
    }
    if (await tx.ledgerAccount.findFirst({ where: { branchId, code: body.code } })) {
      throw conflict('An account with this code already exists in this branch.');
    }
    const account = await tx.ledgerAccount.create({
      data: {
        id: randomUUID(), organizationId: ctx.organizationId, branchId, code: body.code, name: body.name,
        category: body.category, parentId: body.parentId ?? null,
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'LedgerAccount', entityId: account.id, branchId, after: body });
    return account;
  });
  res.status(201).json({
    id: row.id, branchId: row.branchId, code: row.code, name: row.name, category: row.category,
    parentId: row.parentId, isSystem: row.isSystem, isActive: row.isActive,
  });
});

ledgerRouter.get('/accounts/ledger/journals', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = requireRead(ctx);
  const query = z.object({ from: dateOnly.optional(), to: dateOnly.optional() }).parse(req.query);
  if (query.from && query.to && query.from > query.to) throw badRequest('The start date must be on or before the end date.');
  const rows = await withTenant(ctx.organizationId, (tx) => tx.journalEntry.findMany({
    where: {
      branchId: { in: branchIds },
      ...(query.from || query.to ? { entryDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    },
    include: { lines: { include: { account: { select: { code: true, name: true, category: true } } } } },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  }));
  res.json(rows.map((entry) => ({
    id: entry.id, entryNo: entry.entryNo, entryDate: toDateString(entry.entryDate),
    description: entry.description, sourceType: entry.sourceType, sourceId: entry.sourceId,
    debitTotal: entry.lines.reduce((sum, line) => sum + money(line.debit), 0),
    lines: entry.lines.map((line) => ({
      id: line.id, accountId: line.accountId, code: line.account.code, accountName: line.account.name,
      category: line.account.category, description: line.description, debit: money(line.debit), credit: money(line.credit),
    })),
  })));
});

const journalInput = z.object({
  branchId: uuid.optional(),
  entryDate: dateOnly,
  description: z.string().trim().min(1).max(300),
  lines: z.array(z.object({
    accountId: uuid,
    description: z.string().trim().max(200).optional(),
    debit: z.number().min(0).max(100_000_000).refine((value) => Number(value.toFixed(2)) === value, 'Use up to two decimal places.'),
    credit: z.number().min(0).max(100_000_000).refine((value) => Number(value.toFixed(2)) === value, 'Use up to two decimal places.'),
  }).refine((line) => (line.debit > 0) !== (line.credit > 0), 'Enter either a debit or a credit for each line.')).min(2).max(30),
}).superRefine((entry, ctx) => {
  const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.round(debit * 100) !== Math.round(credit * 100)) {
    ctx.addIssue({ code: 'custom', message: 'Total debits must equal total credits.', path: ['lines'] });
  }
});

ledgerRouter.post('/accounts/ledger/journals', async (req, res) => {
  const ctx = ctxOf(req);
  const body = journalInput.parse(req.body);
  const branchId = requireManage(ctx, body.branchId);
  if (body.entryDate > new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) {
    throw badRequest('A journal voucher cannot be dated in the future.');
  }
  const entryId = randomUUID();
  const entry = await withTenant(ctx.organizationId, async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
    if (!branch) throw notFound('Branch');
    const accountIds = [...new Set(body.lines.map((line) => line.accountId))];
    const accounts = await tx.ledgerAccount.findMany({
      where: { id: { in: accountIds }, branchId, isActive: true },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) throw badRequest('Every journal line must use an active account from this branch.');

    const entryNo = `JV/${branch.code}/${toDateString(body.entryDate)}/${entryId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const created = await tx.journalEntry.create({
      data: {
        id: entryId, organizationId: ctx.organizationId, branchId, entryNo, entryDate: body.entryDate,
        description: body.description, createdById: ctx.userId,
        lines: {
          create: body.lines.map((line) => ({
            id: randomUUID(), organizationId: ctx.organizationId, accountId: line.accountId,
            description: line.description || null, debit: line.debit, credit: line.credit,
          })),
        },
      },
      include: { lines: { include: { account: { select: { code: true, name: true, category: true } } } } },
    });
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'JournalEntry', entityId: created.id, branchId,
      after: { entryNo, entryDate: toDateString(body.entryDate), description: body.description, lines: body.lines },
    });
    return created;
  });
  res.status(201).json({
    id: entry.id, entryNo: entry.entryNo, entryDate: toDateString(entry.entryDate), description: entry.description,
    sourceType: entry.sourceType, sourceId: entry.sourceId,
    debitTotal: entry.lines.reduce((sum, line) => sum + money(line.debit), 0),
    lines: entry.lines.map((line) => ({
      id: line.id, accountId: line.accountId, code: line.account.code, accountName: line.account.name,
      category: line.account.category, description: line.description, debit: money(line.debit), credit: money(line.credit),
    })),
  });
});

ledgerRouter.get('/accounts/ledger/reports', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = requireRead(ctx);
  const query = z.object({ from: dateOnly, to: dateOnly }).parse(req.query);
  if (query.from > query.to) throw badRequest('The start date must be on or before the end date.');
  const report = await withTenant(ctx.organizationId, async (tx) => {
    const accounts = await tx.ledgerAccount.findMany({ where: { branchId: { in: branchIds }, isActive: true }, orderBy: { code: 'asc' } });
    const [periodTotals, balancesToDate] = await Promise.all([
      tx.journalLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { is: { branchId: { in: branchIds }, entryDate: { gte: query.from, lte: query.to } } } },
        _sum: { debit: true, credit: true },
      }),
      tx.journalLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { is: { branchId: { in: branchIds }, entryDate: { lte: query.to } } } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const period = new Map(periodTotals.map((row) => [row.accountId, { debit: money(row._sum.debit), credit: money(row._sum.credit) }]));
    const asOf = new Map(balancesToDate.map((row) => [row.accountId, { debit: money(row._sum.debit), credit: money(row._sum.credit) }]));
    const trialBalance = accounts.map((account) => {
      const total = asOf.get(account.id) ?? { debit: 0, credit: 0 };
      const net = money(total.debit - total.credit);
      return {
        accountId: account.id, code: account.code, name: account.name, category: account.category,
        debits: total.debit, credits: total.credit, debitBalance: Math.max(0, net), creditBalance: Math.max(0, -net),
      };
    });
    const income = accounts.filter((account) => account.category === 'INCOME').map((account) => ({
      code: account.code, name: account.name, amount: money((period.get(account.id)?.credit ?? 0) - (period.get(account.id)?.debit ?? 0)),
    })).filter((row) => row.amount !== 0);
    const expenses = accounts.filter((account) => account.category === 'EXPENSE').map((account) => ({
      code: account.code, name: account.name, amount: money((period.get(account.id)?.debit ?? 0) - (period.get(account.id)?.credit ?? 0)),
    })).filter((row) => row.amount !== 0);
    const assets = accounts.filter((account) => account.category === 'ASSET').map((account) => ({
      code: account.code, name: account.name, amount: money((asOf.get(account.id)?.debit ?? 0) - (asOf.get(account.id)?.credit ?? 0)),
    }));
    const liabilities = accounts.filter((account) => account.category === 'LIABILITY').map((account) => ({
      code: account.code, name: account.name, amount: money((asOf.get(account.id)?.credit ?? 0) - (asOf.get(account.id)?.debit ?? 0)),
    }));
    const equity = accounts.filter((account) => account.category === 'EQUITY').map((account) => ({
      code: account.code, name: account.name, amount: money((asOf.get(account.id)?.credit ?? 0) - (asOf.get(account.id)?.debit ?? 0)),
    }));
    const incomeToDate = accounts.filter((account) => account.category === 'INCOME')
      .reduce((sum, account) => sum + (asOf.get(account.id)?.credit ?? 0) - (asOf.get(account.id)?.debit ?? 0), 0);
    const expenseToDate = accounts.filter((account) => account.category === 'EXPENSE')
      .reduce((sum, account) => sum + (asOf.get(account.id)?.debit ?? 0) - (asOf.get(account.id)?.credit ?? 0), 0);
    const currentEarnings = money(incomeToDate - expenseToDate);
    if (currentEarnings !== 0) equity.push({ code: '', name: 'Current earnings (since ledger start)', amount: currentEarnings });
    const totalIncome = money(income.reduce((sum, row) => sum + row.amount, 0));
    const totalExpenses = money(expenses.reduce((sum, row) => sum + row.amount, 0));
    return {
      trialBalance,
      trialBalanceTotals: {
        debits: money(trialBalance.reduce((sum, row) => sum + row.debits, 0)),
        credits: money(trialBalance.reduce((sum, row) => sum + row.credits, 0)),
        debitBalance: money(trialBalance.reduce((sum, row) => sum + row.debitBalance, 0)),
        creditBalance: money(trialBalance.reduce((sum, row) => sum + row.creditBalance, 0)),
      },
      incomeExpenditure: { income, expenses, totalIncome, totalExpenses, surplus: money(totalIncome - totalExpenses) },
      balanceSheet: {
        assets, liabilities, equity,
        totalAssets: money(assets.reduce((sum, row) => sum + row.amount, 0)),
        totalLiabilities: money(liabilities.reduce((sum, row) => sum + row.amount, 0)),
        totalEquity: money(equity.reduce((sum, row) => sum + row.amount, 0)),
      },
    };
  });
  res.json(report);
});
