import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../auth/access.js';
import type { Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';

const SYSTEM_ACCOUNTS: { code: string; name: string; category: string }[] = [
  { code: '1000', name: 'Cash on Hand', category: 'ASSET' },
  { code: '1010', name: 'Operating Bank Account', category: 'ASSET' },
  { code: '1020', name: 'Card / Gateway Clearing', category: 'ASSET' },
  { code: '1100', name: 'Fee Receivables', category: 'ASSET' },
  { code: '1110', name: 'Staff Salary Advances', category: 'ASSET' },
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

type JournalLineInput = { accountCode?: string; accountId?: string; description?: string; debit?: number; credit?: number };

export async function postJournal(
  tx: Tx,
  ctx: RequestContext,
  input: {
    branchId: string;
    date: Date;
    description: string;
    sourceType: string;
    sourceId: string;
    lines: JournalLineInput[];
  },
) {
  const totalDebit = input.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  if (totalDebit <= 0 || Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error('Ledger integration attempted to post an unbalanced journal.');
  }

  const existing = await tx.journalEntry.findFirst({
    where: { branchId: input.branchId, sourceType: input.sourceType, sourceId: input.sourceId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const existingAccounts = await tx.ledgerAccount.findMany({
    where: { branchId: input.branchId },
    select: { code: true },
  });
  const existingCodes = new Set(existingAccounts.map((account) => account.code));
  const missing = SYSTEM_ACCOUNTS.filter((account) => !existingCodes.has(account.code));
  if (missing.length) {
    await tx.ledgerAccount.createMany({
      data: missing.map((account) => ({
        id: randomUUID(), organizationId: ctx.organizationId, branchId: input.branchId, ...account, isSystem: true,
      })),
    });
  }

  const codes = [...new Set(input.lines.flatMap((line) => line.accountCode ? [line.accountCode] : []))];
  const ids = [...new Set(input.lines.flatMap((line) => line.accountId ? [line.accountId] : []))];
  const accounts = await tx.ledgerAccount.findMany({
    where: { branchId: input.branchId, code: { in: codes }, isActive: true },
    select: { id: true, code: true },
  });
  const selectedAccounts = ids.length ? await tx.ledgerAccount.findMany({
    where: { branchId: input.branchId, id: { in: ids }, isActive: true },
    select: { id: true },
  }) : [];
  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
  const validIds = new Set(selectedAccounts.map((account) => account.id));
  if (accountByCode.size !== codes.length || validIds.size !== ids.length
    || input.lines.some((line) => !line.accountCode && !line.accountId)) {
    throw new Error('A default or selected ledger account required for automatic posting is missing or inactive.');
  }

  const branch = await tx.branch.findUniqueOrThrow({ where: { id: input.branchId }, select: { code: true } });
  const id = randomUUID();
  const date = input.date.toISOString().slice(0, 10);
  const entryNo = `AUTO/${branch.code}/${date}/${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await tx.journalEntry.create({
    data: {
      id, organizationId: ctx.organizationId, branchId: input.branchId, entryNo, entryDate: input.date,
      description: input.description.slice(0, 300), sourceType: input.sourceType, sourceId: input.sourceId,
      createdById: ctx.userId,
      lines: {
        create: input.lines.map((line) => ({
          id: randomUUID(), organizationId: ctx.organizationId,
          accountId: line.accountId ?? accountByCode.get(line.accountCode!)!,
          description: line.description?.slice(0, 200) ?? null, debit: line.debit ?? 0, credit: line.credit ?? 0,
        })),
      },
    },
  });
  await audit(tx, ctx, {
    action: 'CREATE', entity: 'JournalEntry', entityId: id, branchId: input.branchId,
    after: { entryNo, entryDate: date, description: input.description, sourceType: input.sourceType, sourceId: input.sourceId },
  });
  return id;
}

export function cashAccountForMethod(method: string) {
  if (method === 'CASH') return '1000';
  if (method === 'CARD' || method === 'POS') return '1020';
  return '1010';
}

export async function paymentLedgerLine(tx: Tx, branchId: string, method: string, accountType = 'OPERATING') {
  const accountCode = cashAccountForMethod(method);
  if (accountCode !== '1010') return { accountCode };
  const bankAccount = await tx.bankAccount.findFirst({
    where: { branchId, accountType, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { ledgerAccountId: true },
  });
  return bankAccount ? { accountId: bankAccount.ledgerAccountId } : { accountCode };
}

export function expenseAccountForCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('electric') || normalized.includes('water') || normalized.includes('internet') || normalized.includes('utility')) return '5010';
  if (normalized.includes('maintenance') || normalized.includes('repair')) return '5020';
  if (normalized.includes('stationery') || normalized.includes('print') || normalized.includes('suppl')) return '5030';
  if (normalized.includes('transport') || normalized.includes('fuel')) return '5040';
  return '5050';
}
