/**
 * Jarvis reads anything in the ERP the way the pages do: it calls the ERP's own list endpoints (GET only)
 * with the signed-in person's token, so the API's permissions, branch rules and row-level security decide
 * what comes back — Jarvis never touches the database directly and can never see more than the person
 * could on the pages. A question is matched to an endpoint by Hinglish keywords; the reply is a short
 * summary of the list (how many, the first few by name, filtered by a status word like "pending").
 */

type Entry = { path: string; title: string; words: string[]; query?: () => string };

/** Indian financial year so far (1 April → today), for reports that need a period. */
const financialYearToDate = () => {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `?from=${startYear}-04-01&to=${now.toISOString().slice(0, 10)}`;
};

/** Every list the ERP shows, with the words people use for it. Longer phrases count more. */
export const ERP_LISTS: Entry[] = [
  { path: '/audit-log', title: 'Audit log', words: ['audit', 'audit log', 'kisne kya badla', 'changes log', 'activity log'] },
  { path: '/me', title: 'Aapka account', words: ['mera account', 'meri profile', 'mera role', 'mere roles'] },
  { path: '/org', title: 'Organization', words: ['organization', 'organisation', 'trust details', 'school group'] },
  { path: '/regions', title: 'Regions', words: ['region', 'regions', 'region office'] },
  { path: '/branches', title: 'Schools / branches', words: ['branch', 'branches', 'schools list', 'kitne school', 'campus'] },
  { path: '/academic-years', title: 'Academic years', words: ['academic year', 'session', 'sessions'] },
  { path: '/grades', title: 'Classes', words: ['classes list', 'kaun kaun si class', 'saari classes', 'grades'] },
  { path: '/subjects', title: 'Subjects', words: ['subject', 'subjects', 'vishay'] },
  { path: '/students', title: 'Students', words: ['students list', 'student list', 'sab students', 'bacchon ki list', 'saare bachche'] },
  { path: '/users', title: 'Login users', words: ['users', 'user list', 'login accounts', 'login users'] },
  { path: '/roles', title: 'Roles', words: ['roles', 'role list', 'permissions list'] },
  { path: '/procurement/indents', title: 'Purchase requests', words: ['purchase request', 'purchase requests', 'pr', 'indent', 'indents', 'requisition', 'kharid request', 'maang patra'] },
  { path: '/procurement/vendors', title: 'Vendors', words: ['vendor', 'vendors', 'supplier', 'suppliers', 'dukaandar'] },
  { path: '/procurement/quotations', title: 'Quotations', words: ['quotation', 'quotations', 'quote', 'quotes'] },
  { path: '/procurement/purchase-orders', title: 'Purchase orders', words: ['purchase order', 'purchase orders', 'po', 'pos'] },
  { path: '/procurement/receipts', title: 'Goods receipts (GRN)', words: ['grn', 'goods receipt', 'goods receipts', 'maal aaya', 'delivery'] },
  { path: '/payables/bills', title: 'Vendor bills', words: ['vendor bill', 'vendor bills', 'bills', 'bill', 'payable', 'payables'] },
  { path: '/payables/payments', title: 'Vendor payments', words: ['vendor payment', 'vendor payments', 'bill payment', 'bill payments'] },
  { path: '/petty-cash', title: 'Petty cash', words: ['petty cash', 'chhota kharcha'] },
  { path: '/staff', title: 'Staff', words: ['staff list', 'teachers list', 'teacher list', 'sab teachers', 'saare teachers', 'karmchari', 'employees'] },
  { path: '/exams', title: 'Exams', words: ['exams list', 'exam list', 'saare exams', 'kaun kaun se exam'] },
  { path: '/marks/ranks', title: 'Ranks', words: ['rank', 'ranks', 'topper', 'toppers', 'top students', 'merit list'] },
  { path: '/notes', title: 'Study notes', words: ['study notes', 'notes', 'study material'] },
  { path: '/fees/structure', title: 'Fee structure', words: ['fee structure', 'fees structure', 'fee plan', 'fees kitni hai'] },
  { path: '/fees/refunds', title: 'Fee refunds', words: ['refund', 'refunds', 'fees wapas'] },
  { path: '/fees/payments', title: 'Fee payments', words: ['fee payments', 'fees payments', 'fee receipts', 'receipts', 'collection list', 'fees jama hui'] },
  { path: '/expenses', title: 'Expenses', words: ['expense', 'expenses', 'kharcha', 'kharche', 'kharchon'] },
  { path: '/accounts/ledger/accounts', title: 'Ledger accounts', words: ['ledger accounts', 'chart of accounts', 'ledger'] },
  { path: '/accounts/ledger/journals', title: 'Journal vouchers', words: ['journal', 'journals', 'voucher', 'vouchers'] },
  { path: '/accounts/ledger/reports', title: 'Accounts reports (is financial year)', words: ['balance sheet', 'trial balance', 'profit', 'income statement', 'p and l'], query: financialYearToDate },
  { path: '/accounts/banking/accounts', title: 'Bank accounts', words: ['bank account', 'bank accounts', 'bank balance', 'bank'] },
  { path: '/accounts/banking/statement-lines', title: 'Bank statement', words: ['bank statement', 'statement lines', 'reconciliation'] },
  { path: '/accounts/budgets', title: 'Budgets', words: ['budget', 'budgets'] },
  { path: '/accounts/grants', title: 'Grants', words: ['grant', 'grants', 'donation fund'] },
  { path: '/leaves', title: 'Leave requests', words: ['leave requests', 'leave list', 'leave applications', 'chhutti applications', 'chhutti ki arzi'] },
  { path: '/payroll/advances', title: 'Salary advances', words: ['salary advance', 'salary advances', 'advance', 'advances'] },
  { path: '/payroll', title: 'Payroll', words: ['payroll', 'salary run', 'salary register', 'salary sheet'] },
  { path: '/messages', title: 'Messages', words: ['messages', 'inbox', 'mere messages'] },
  { path: '/website/messages', title: 'Website messages', words: ['website messages', 'contact messages', 'complaints', 'complaint', 'grievance', 'shikayat'] },
  { path: '/website/alumni', title: 'Alumni', words: ['alumni', 'purane students', 'ex students'] },
  { path: '/jobs', title: 'Job openings', words: ['job openings', 'jobs', 'vacancy', 'vacancies', 'naukri', 'bharti'] },
  { path: '/job-applications', title: 'Job applications', words: ['job applications', 'applications', 'candidates', 'applicants'] },
  { path: '/enquiries', title: 'Admission enquiries', words: ['enquiry', 'enquiries', 'inquiry', 'admission enquiry', 'admission enquiries', 'admissions', 'poochtaach'] },
  { path: '/visitors', title: 'Visitors', words: ['visitor', 'visitors', 'mehmaan', 'mehman', 'gate entry'] },
  { path: '/library', title: 'Library books', words: ['library books', 'books list', 'kitabein', 'kitaben', 'library'] },
  { path: '/library/digital-books', title: 'Digital books', words: ['digital books', 'ebook', 'ebooks', 'e books', 'pdf books'] },
  { path: '/inventory/items', title: 'Store items', words: ['inventory', 'stock items', 'store items', 'saaman list', 'samaan list'] },
  { path: '/inventory/movements', title: 'Stock movements', words: ['stock movement', 'stock movements', 'stock in out'] },
  { path: '/inventory/analysis', title: 'Stock analysis', words: ['stock analysis', 'stock value'] },
  { path: '/transport', title: 'Transport', words: ['transport', 'buses', 'routes', 'vehicles', 'gaadiyan', 'school bus'] },
  { path: '/hostel', title: 'Hostel', words: ['hostel', 'rooms', 'kamre', 'outpass', 'warden'] },
  { path: '/onboarding', title: 'Onboarding', words: ['onboarding', 'joining', 'naye staff', 'new joinees'] },
  { path: '/staff-attendance', title: 'Staff attendance', words: ['staff attendance', 'teachers ki attendance', 'staff hazri', 'staff ki attendance'] },
  { path: '/me/attendance', title: 'Aapki attendance', words: ['meri attendance', 'my attendance'] },
  { path: '/leave-balances', title: 'Leave balances', words: ['leave balance', 'leave balances', 'kitni chhutti bachi', 'bachi hui chhutti'] },
  { path: '/expense-claims', title: 'Expense claims', words: ['claim', 'claims', 'reimbursement', 'expense claim', 'expense claims'] },
  { path: '/me/payslips', title: 'Aapki payslips', words: ['meri payslips', 'saari payslips', 'my payslips'] },
  { path: '/interviews', title: 'Interviews', words: ['interview', 'interviews'] },
  { path: '/offers', title: 'Job offers', words: ['offer letter', 'offer letters', 'offers', 'job offers'] },
  { path: '/trainings', title: 'Trainings', words: ['training', 'trainings'] },
  { path: '/trainings-mis', title: 'Training report', words: ['training report', 'training mis'] },
  { path: '/separations', title: 'Separations', words: ['resignation', 'resignations', 'separation', 'separations', 'exit', 'istifa'] },
  { path: '/group/overview', title: 'Group overview', words: ['group overview', 'sab schools', 'saare schools', 'region report', 'group report'] },
];

function normalize(text: string) {
  return ` ${text.toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** The best list for a question, or null. */
export function matchList(question: string): Entry | null {
  const q = normalize(question);
  let best: { entry: Entry; score: number } | null = null;
  for (const entry of ERP_LISTS) {
    let score = 0;
    for (const word of entry.words) if (q.includes(` ${word} `)) score = Math.max(score, word.split(' ').length * 2 + word.length / 100);
    if (score && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

type Any = Record<string, any>;
const LABEL_KEYS = ['name', 'title', 'fullName', 'studentName', 'staffName', 'vendorName', 'candidateName', 'visitorName', 'subject', 'no', 'number', 'receiptNo', 'billNo', 'registrationNo', 'entryNo', 'code', 'month', 'description', 'purpose'];
const DATE_KEYS = ['date', 'dueDate', 'fromDate', 'createdAt', 'paidAt', 'entryDate', 'visitDate', 'issueDate', 'since'];
const MONEY_KEYS = ['amount', 'total', 'net', 'netAmount', 'grandTotal', 'balance', 'value'];

const isId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

/** The date of a row: a known date field, else any field named …Date / …At / …Time holding a date. */
function dateOf(item: Any): string | null {
  const known = DATE_KEYS.find((key) => isDate(item?.[key]));
  if (known) return String(item[known]).slice(0, 10);
  const other = Object.keys(item ?? {}).find((key) => /(date|at|time|on)$/i.test(key) && isDate(item[key]));
  return other ? String(item[other]).slice(0, 10) : null;
}

/** A person's or thing's name in a row, also inside nested objects ({ student: { firstName… } }). */
function nameOf(item: Any, depth = 0): string {
  if (!item || typeof item !== 'object' || depth > 2) return '';
  for (const key of LABEL_KEYS) {
    const value = item[key];
    if (typeof value === 'string' && value.trim() && !isId(value)) return value.trim().slice(0, 60);
  }
  if (typeof item.firstName === 'string') return [item.firstName, item.middleName, item.lastName].filter(Boolean).join(' ');
  const named = Object.keys(item).find((key) => /name$/i.test(key) && typeof item[key] === 'string' && item[key].trim() && !isId(item[key]));
  if (named) return String(item[named]).slice(0, 60);
  for (const value of Object.values(item)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const inner = nameOf(value as Any, depth + 1);
      if (inner) return inner;
    }
  }
  return '';
}

function labelOf(item: Any): string {
  if (typeof item !== 'object' || item === null) return String(item);
  // audit events: who did what
  if (typeof item.action === 'string' && typeof item.entity === 'string') {
    return `${item.user ?? item.username ?? ''}: ${item.action.toLowerCase()} ${item.entity}${dateOf(item) ? ` (${dateOf(item)})` : ''}`.trim();
  }
  let label = nameOf(item);
  if (!label && typeof item.reason === 'string') label = item.reason.slice(0, 60);
  if (!label) {
    // e.g. audit events: "UPDATE FeePayment"
    label = ['action', 'entity', 'type', 'category', 'room', 'block'].map((key) => item[key]).filter((v) => typeof v === 'string' && !isId(v)).slice(0, 2).join(' ');
  }
  const extra: string[] = [];
  if (typeof item.status === 'string') extra.push(item.status.toLowerCase().replace(/_/g, ' '));
  const money = MONEY_KEYS.find((key) => typeof item[key] === 'number' || (typeof item[key] === 'string' && /^\d+(\.\d+)?$/.test(item[key])));
  if (money) extra.push(`₹${Math.round(Number(item[money])).toLocaleString('en-IN')}`);
  const date = dateOf(item);
  if (date) extra.push(date);
  return `${label || 'record'}${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

/** The list inside a response: an array, { items }, { data }, or the first array field. */
function listIn(data: unknown): { rows: Any[]; key: string } | null {
  if (Array.isArray(data)) return { rows: data, key: '' };
  if (data && typeof data === 'object') {
    const object = data as Any;
    for (const key of ['items', 'data', 'rows', 'results']) if (Array.isArray(object[key])) return { rows: object[key], key: '' };
  }
  return null;
}

/** A short spoken summary of what an ERP list returned; filtered by status words in the question. */
export function summarizeList(title: string, data: unknown, question: string): string {
  const q = normalize(question);
  const found = listIn(data);
  if (!found) {
    // an object of several lists / numbers (e.g. transport, hostel, reports)
    const object = (data ?? {}) as Any;
    const parts: string[] = [];
    const words = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const amount = (key: string, value: number) => (key === 'total' && 'pageSize' in object ? `${value} records` : /(amount|total|balance|assets|liabilit|equity|income|expense|profit|debit|credit|value|net)/i.test(key) ? `₹${Math.round(value).toLocaleString('en-IN')}` : String(Math.round(value * 100) / 100));
    for (const [key, value] of Object.entries(object)) {
      if (['page', 'pageSize'].includes(key)) continue;
      if (Array.isArray(value)) parts.push(`${words(key)}: ${value.length}${value.length ? ` (${value.slice(0, 3).map(labelOf).join('; ')}${value.length > 3 ? ' …' : ''})` : ''}`);
      else if (typeof value === 'number') parts.push(`${words(key)}: ${amount(key, value)}`);
      else if (value && typeof value === 'object') {
        // one level down, e.g. a report's { balanceSheet: { totalAssets … } }
        const inner = Object.entries(value as Any).filter(([, v]) => typeof v === 'number').slice(0, 4).map(([k, v]) => `${words(k)} ${amount(k, v as number)}`);
        if (inner.length) parts.push(`${words(key)}: ${inner.join(', ')}`);
      }
      if (parts.length >= 6) break;
    }
    return parts.length ? `${title} — ${parts.join('. ')}.` : `${title}: is mein dikhane layak kuch nahi mila.`;
  }
  let rows = found.rows;
  // "pending purchase requests", "approved leaves", "paid bills" — filter by a status the rows actually have
  const statuses = [...new Set(rows.map((r) => (typeof r?.status === 'string' ? r.status : '')).filter(Boolean))];
  const wanted = statuses.filter((s) => q.includes(` ${s.toLowerCase().replace(/_/g, ' ')} `) || q.includes(` ${s.toLowerCase().split('_')[0]} `));
  let filterNote = '';
  if (wanted.length) {
    rows = rows.filter((r) => wanted.includes(r.status));
    filterNote = ` (${wanted.map((s) => s.toLowerCase().replace(/_/g, ' ')).join(', ')})`;
  }
  // "aaj ke visitors / aaj ki payments"
  if (/ aaj | today /.test(q) && rows.some((r) => dateOf(r))) {
    const today = new Date().toISOString().slice(0, 10);
    rows = rows.filter((r) => dateOf(r) === today);
    filterNote += ' (aaj)';
  }
  if (!rows.length) return `${title}${filterNote}: koi record nahi hai.`;
  const shown = rows.slice(0, 6).map(labelOf);
  return `${title}${filterNote}: kul ${rows.length}. ${shown.join('; ')}${rows.length > 6 ? ` … aur ${rows.length - 6}` : ''}.`;
}

/**
 * Reads one ERP list as the signed-in person: same token, same branch header, through the API itself
 * (so its permission checks apply). Returns the summary, or a polite reason it could not.
 */
/** Rows that carry only a studentId / staffId get that person's name (from the caller's resolver). */
async function addNames(data: unknown, resolve?: (ids: string[]) => Promise<Map<string, string>>) {
  if (!resolve || !data || typeof data !== 'object') return;
  const lists = Array.isArray(data) ? [data] : Object.values(data as Any).filter(Array.isArray);
  const rows = (lists as Any[][]).flat().filter((row) => row && typeof row === 'object' && !nameOf(row));
  const ids = [...new Set(rows.flatMap((row) => [row.studentId, row.staffId]).filter((id): id is string => typeof id === 'string'))];
  if (!ids.length) return;
  const names = await resolve(ids.slice(0, 500));
  for (const row of rows) {
    const name = names.get(String(row.studentId ?? '').toLowerCase()) ?? names.get(String(row.staffId ?? '').toLowerCase());
    if (name) row.name = name;
  }
}

export async function readList(
  entry: Entry,
  question: string,
  local: { port: number; authorization?: string; branchId?: string },
  resolveNames?: (ids: string[]) => Promise<Map<string, string>>,
) {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${local.port}/api/v1${entry.path}${entry.query?.() ?? ''}`, {
      headers: {
        accept: 'application/json',
        ...(local.authorization ? { authorization: local.authorization } : {}),
        ...(local.branchId ? { 'x-branch-id': local.branchId } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return `${entry.title} abhi padh nahi paya. Thodi der baad try karein.`;
  }
  if (response.status === 401 || response.status === 403) return `${entry.title} aapke role ke liye available nahi hai.`;
  if (!response.ok) return `${entry.title} abhi nahi mil paya (${response.status}).`;
  const text = await response.text();
  if (text.length > 3_000_000) return `${entry.title} bahut bada hai — page par dekhein.`;
  let data: unknown;
  try { data = JSON.parse(text); } catch { return `${entry.title} page par dekhein.`; }
  await addNames(data, resolveNames).catch(() => undefined);
  return summarizeList(entry.title, data, question);
}
