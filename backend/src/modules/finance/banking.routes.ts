import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { scopeBranches, targetBranch, type RequestContext } from '../../auth/access.js';
import { withTenant } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { postJournal } from './ledger.js';

export const bankingRouter = Router();

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const amount = z.number().positive().max(100_000_000).refine((value) => Number(value.toFixed(2)) === value, 'Use up to two decimal places.');

function readBranches(ctx: RequestContext) {
  return scopeBranches(ctx, 'accounting.read');
}

function manageBranch(ctx: RequestContext, branchId?: string) {
  return targetBranch(ctx, 'accounting.manage', branchId);
}

bankingRouter.get('/accounts/banking/accounts', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = readBranches(ctx);
  const rows = await withTenant(ctx.organizationId, (tx) => tx.bankAccount.findMany({
    where: { branchId: { in: branches } },
    include: { ledgerAccount: { select: { code: true, name: true } } },
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  }));
  res.json(rows.map((row) => ({
    id: row.id, branchId: row.branchId, ledgerAccountId: row.ledgerAccountId, ledgerCode: row.ledgerAccount.code,
    ledgerName: row.ledgerAccount.name, name: row.name, bankName: row.bankName, accountLast4: row.accountLast4,
    accountType: row.accountType, openingBalance: money(row.openingBalance), isActive: row.isActive,
  })));
});

bankingRouter.post('/accounts/banking/accounts', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: uuid.optional(), ledgerAccountId: uuid, name: z.string().trim().min(2).max(100),
    bankName: z.string().trim().min(2).max(100), accountLast4: z.string().regex(/^\d{4}$/),
    accountType: z.enum(['OPERATING', 'HOSTEL', 'TRUST', 'GRANT', 'OTHER']),
    openingBalance: z.number().min(0).max(100_000_000),
  }).parse(req.body);
  const branchId = manageBranch(ctx, body.branchId);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const ledger = await tx.ledgerAccount.findFirst({ where: { id: body.ledgerAccountId, branchId, category: 'ASSET', isActive: true } });
    if (!ledger) throw badRequest('Choose an active asset account from this branch.');
    if (await tx.bankAccount.findFirst({ where: { branchId, name: body.name } })) throw conflict('A bank account with this name already exists.');
    const account = await tx.bankAccount.create({
      data: {
        id: randomUUID(), organizationId: ctx.organizationId, branchId, ledgerAccountId: body.ledgerAccountId,
        name: body.name, bankName: body.bankName, accountLast4: body.accountLast4,
        accountType: body.accountType, openingBalance: body.openingBalance,
      },
    });
    if (body.openingBalance > 0) {
      const openingDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      await postJournal(tx, ctx, {
        branchId, date: openingDate, description: `Opening balance · ${body.name}`,
        sourceType: 'BANK_ACCOUNT_OPENING', sourceId: account.id,
        lines: [
          { accountId: account.ledgerAccountId, description: `Opening balance · ${body.bankName}`, debit: body.openingBalance },
          { accountCode: '3000', description: 'Opening trust / capital', credit: body.openingBalance },
        ],
      });
    }
    await audit(tx, ctx, { action: 'CREATE', entity: 'BankAccount', entityId: account.id, branchId, after: { ...body, accountLast4: `****${body.accountLast4}` } });
    return account;
  });
  res.status(201).json({
    id: row.id, branchId: row.branchId, ledgerAccountId: row.ledgerAccountId, name: row.name,
    bankName: row.bankName, accountLast4: row.accountLast4, accountType: row.accountType,
    openingBalance: money(row.openingBalance), isActive: row.isActive,
  });
});

const statementLineInput = z.object({
  transactionDate: dateOnly, description: z.string().trim().min(1).max(300),
  reference: z.string().trim().max(100).optional(), direction: z.enum(['CREDIT', 'DEBIT']), amount,
});

bankingRouter.post('/accounts/banking/accounts/:bankAccountId/import', async (req, res) => {
  const ctx = ctxOf(req);
  const bankAccountId = idParam(req, 'bankAccountId');
  const lines = z.object({ lines: z.array(statementLineInput).min(1).max(500) }).parse(req.body).lines;
  const result = await withTenant(ctx.organizationId, async (tx) => {
    const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw notFound('Bank account');
    if (!ctx.access.can('accounting.manage', account.branchId)) throw forbidden();
    let imported = 0;
    let duplicates = 0;
    for (const line of lines) {
      const fingerprint = createHash('sha256').update([
        toDateString(line.transactionDate), line.direction, money(line.amount).toFixed(2),
        line.reference?.toLowerCase().trim() ?? '', line.description.toLowerCase().trim(),
      ].join('|')).digest('hex');
      const existing = await tx.bankStatementLine.findUnique({
        where: { bankAccountId_fingerprint: { bankAccountId, fingerprint } },
        select: { id: true },
      });
      if (existing) { duplicates++; continue; }
      await tx.bankStatementLine.create({
        data: {
          id: randomUUID(), organizationId: ctx.organizationId, branchId: account.branchId, bankAccountId,
          transactionDate: line.transactionDate, description: line.description, reference: line.reference ?? null,
          direction: line.direction, amount: line.amount, fingerprint, status: 'UNMATCHED', importedById: ctx.userId,
        },
      });
      imported++;
    }
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'BankStatementImport', branchId: account.branchId,
      after: { bankAccountId, linesReceived: lines.length, imported, duplicates },
    });
    return { imported, duplicates };
  });
  res.status(201).json(result);
});

bankingRouter.get('/accounts/banking/statement-lines', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = readBranches(ctx);
  const query = z.object({
    bankAccountId: uuid.optional(),
    status: z.enum(['UNMATCHED', 'MATCHED', 'IGNORED']).optional(),
  }).parse(req.query);
  const rows = await withTenant(ctx.organizationId, (tx) => tx.bankStatementLine.findMany({
    where: { branchId: { in: branches }, ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}), ...(query.status ? { status: query.status } : {}) },
    include: { bankAccount: { select: { name: true } }, matchedJournalLine: { select: { id: true } } },
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], take: 500,
  }));
  res.json(rows.map((line) => ({
    id: line.id, bankAccountId: line.bankAccountId, bankAccount: line.bankAccount.name,
    transactionDate: toDateString(line.transactionDate), description: line.description, reference: line.reference,
    direction: line.direction, amount: money(line.amount), status: line.status, matchedJournalLineId: line.matchedJournalLineId,
  })));
});

bankingRouter.get('/accounts/banking/statement-lines/:lineId/matches', async (req, res) => {
  const ctx = ctxOf(req);
  const lineId = idParam(req, 'lineId');
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const statement = await tx.bankStatementLine.findUnique({
      where: { id: lineId },
      include: { bankAccount: { select: { ledgerAccountId: true } } },
    });
    if (!statement) throw notFound('Statement line');
    if (!ctx.access.can('accounting.read', statement.branchId)) throw forbidden();
    if (statement.status !== 'UNMATCHED') throw conflict('Only unmatched statement lines can be reconciled.');
    const from = new Date(statement.transactionDate.getTime() - 3 * 86_400_000);
    const to = new Date(statement.transactionDate.getTime() + 3 * 86_400_000);
    return tx.journalLine.findMany({
      where: {
        accountId: statement.bankAccount.ledgerAccountId,
        ...(statement.direction === 'CREDIT' ? { debit: statement.amount, credit: 0 } : { debit: 0, credit: statement.amount }),
        bankStatementLines: { none: {} },
        journalEntry: { is: { branchId: statement.branchId, entryDate: { gte: from, lte: to } } },
      },
      include: { journalEntry: { select: { entryNo: true, entryDate: true, description: true, sourceType: true, sourceId: true } } },
      orderBy: { journalEntry: { entryDate: 'desc' } },
      take: 20,
    });
  });
  res.json(rows.map((row) => ({
    journalLineId: row.id, entryNo: row.journalEntry.entryNo, entryDate: toDateString(row.journalEntry.entryDate),
    description: row.description ?? row.journalEntry.description, sourceType: row.journalEntry.sourceType,
    amount: money(row.debit || row.credit), direction: money(row.debit) > 0 ? 'CREDIT' : 'DEBIT',
  })));
});

bankingRouter.post('/accounts/banking/statement-lines/:lineId/match', async (req, res) => {
  const ctx = ctxOf(req);
  const lineId = idParam(req, 'lineId');
  const journalLineId = uuid.parse(req.body.journalLineId);
  const line = await withTenant(ctx.organizationId, async (tx) => {
    const statement = await tx.bankStatementLine.findUnique({
      where: { id: lineId }, include: { bankAccount: { select: { ledgerAccountId: true } } },
    });
    if (!statement) throw notFound('Statement line');
    if (!ctx.access.can('accounting.manage', statement.branchId)) throw forbidden();
    if (statement.status !== 'UNMATCHED') throw conflict('This statement line has already been reconciled.');
    const from = new Date(statement.transactionDate.getTime() - 3 * 86_400_000);
    const to = new Date(statement.transactionDate.getTime() + 3 * 86_400_000);
    const journal = await tx.journalLine.findFirst({
      where: {
        id: journalLineId, accountId: statement.bankAccount.ledgerAccountId,
        ...(statement.direction === 'CREDIT' ? { debit: statement.amount, credit: 0 } : { debit: 0, credit: statement.amount }),
        bankStatementLines: { none: {} },
        journalEntry: { is: { branchId: statement.branchId, entryDate: { gte: from, lte: to } } },
      },
    });
    if (!journal) throw badRequest('The selected journal line does not match this bank account, amount and direction.');
    const updated = await tx.bankStatementLine.update({
      where: { id: statement.id }, data: { status: 'MATCHED', matchedJournalLineId: journal.id },
    });
    await audit(tx, ctx, {
      action: 'UPDATE', entity: 'BankStatementLine', entityId: updated.id, branchId: statement.branchId,
      before: { status: statement.status }, after: { status: updated.status, matchedJournalLineId: journal.id },
    });
    return updated;
  });
  res.json({ id: line.id, status: line.status, matchedJournalLineId: line.matchedJournalLineId });
});

bankingRouter.post('/accounts/banking/statement-lines/:lineId/ignore', async (req, res) => {
  const ctx = ctxOf(req);
  const lineId = idParam(req, 'lineId');
  const body = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
    if (!line) throw notFound('Statement line');
    if (!ctx.access.can('accounting.manage', line.branchId)) throw forbidden();
    if (line.status !== 'UNMATCHED') throw conflict('Only unmatched lines can be ignored.');
    const updated = await tx.bankStatementLine.update({ where: { id: lineId }, data: { status: 'IGNORED' } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'BankStatementLine', entityId: lineId, branchId: line.branchId, before: { status: line.status }, after: { status: 'IGNORED', reasonProvided: true } });
    return updated;
  });
  res.json({ id: row.id, status: row.status });
});
