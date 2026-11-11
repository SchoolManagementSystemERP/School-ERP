/**
 * Fees, from the API: the fee structure (GET /fees/structure), each student's fee account for the
 * year (GET /fees/accounts — amounts after concessions, worked out by the server) and payments
 * (GET /fees/payments). Pages keep the old shapes (grade number → annual fee, FeePayment, feeAccount()).
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { DEFAULT_ANNUAL_FEE, INSTALLMENTS, LATE_FEE_PER_DAY } from "@/data/fees";
import { parseClassName } from "@/data/classes";
import { daysUntil } from "@/lib/dates";
import type { FeePayment, Installment } from "@/types/fees";
import type { Student } from "@/types/student";
import { mayRead } from "./auth";
import { gradeStore } from "./classes";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";

interface ApiStructure {
  lateFeePerDay: number;
  lateFeeRule?: { type: "DAILY_FLAT" | "FLAT" | "PERCENTAGE" | "DAILY_COMPOUND"; amount: number };
  grades: {
    gradeId: string; grade: string; branchId: string; annualAmount: number | null;
    installments: { no: number; name: string; dueDate: string; percent: number }[];
    feeHeads?: { feeHead: string; annualAmount: number; components?: { name: string; amount: number }[] | null; installments: { no: number; name: string; dueDate: string; percent: number }[] }[];
  }[];
}
interface ApiAccount {
  studentId: string; annualFee: number; concessionPercent: number; total: number;
  installments: { no: number; name: string; dueDate: string; amount: number }[];
  feeHeads: {
    feeHead: string; annualAmount: number; concessionPercent: number; total: number;
    components: { name: string; amount: number }[];
    installments: { id: string; no: number; name: string; dueDate: string; amount: number }[];
  }[];
}
interface ApiPayment { id: string; studentId: string; installmentId: string; installmentNo: number; feeHead: string; amount: number; lateFee: number; method: string; receiptNo: string; gatewayRef: string | null; paidAt: string; refundedAmount?: number; netAmount?: number; status?: string }
interface ApiFeeReceipt {
  receiptNo: string; studentName: string; rollNo: string; feeHead: string; installmentNo: number;
  amount: number; lateFee: number; method: string; reference: string | null; paidAt: string | null;
  refundedAmount: number; refunds: { refundNo: string; amount: number; method: string; reason: string; refundedAt: string | null }[];
}

const METHOD_LABEL: Record<string, string> = { UPI: "UPI", CARD: "Card", NETBANKING: "Net Banking", CASH: "Cash", CHEQUE: "Cheque" };
const gradeNo = (name: string) => Number(name.replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

let lateFeePerDay = LATE_FEE_PER_DAY;

export interface LateFeeRule { type: "DAILY_FLAT" | "FLAT" | "PERCENTAGE" | "DAILY_COMPOUND"; amount: number }
export interface FeeHeadPlan {
  gradeId: string;
  grade: string;
  branchId: string;
  feeHead: string;
  annualAmount: number;
  components: { name: string; amount: number }[];
  installments: { no: number; name: string; dueDate: string; percent: number }[];
}
export interface FeeRules {
  lateFeePerDay: number;
  lateFeeRule: LateFeeRule;
  installments: { no: number; name: string; dueDate: string; percent: number }[];
}

let structureRequest: Promise<ApiStructure> | null = null;
function fetchStructure() {
  structureRequest ??= api.get<ApiStructure>("/fees/structure").finally(() => setTimeout(() => { structureRequest = null; }, 0));
  return structureRequest;
}

/** Annual tuition per grade (₹), editable by the accountant. */
export const feePlanStore = remoteStore<Record<number, number>>("fee-plan", {}, async () => {
  const s = await fetchStructure();
  lateFeePerDay = s.lateFeePerDay;
  return Object.fromEntries(s.grades.filter((g) => g.annualAmount != null).map((g) => [gradeNo(g.grade), g.annualAmount!]));
});
export const useFeePlan = () => feePlanStore.useValue();

/** The school's installment schedule and late fee (from the fee structure). */
export const feeRulesStore = remoteStore<FeeRules>("fee-rules", {
  lateFeePerDay: LATE_FEE_PER_DAY, lateFeeRule: { type: "DAILY_FLAT", amount: LATE_FEE_PER_DAY }, installments: [],
}, async () => {
  const s = await fetchStructure();
  const lateFeeRule = s.lateFeeRule ?? { type: "DAILY_FLAT" as const, amount: s.lateFeePerDay };
  return { lateFeePerDay: s.lateFeePerDay, lateFeeRule, installments: s.grades.find((g) => g.installments.length)?.installments ?? [] };
});
export const useFeeRules = () => feeRulesStore.useValue();

export const feeHeadStore = remoteStore<FeeHeadPlan[]>("fee-heads", [], async () => {
  const s = await fetchStructure();
  return s.grades.flatMap((grade) => (grade.feeHeads ?? []).map((head) => ({
    gradeId: grade.gradeId, grade: grade.grade, branchId: grade.branchId, feeHead: head.feeHead,
    annualAmount: head.annualAmount, components: head.components ?? [{ name: "General fee", amount: head.annualAmount }], installments: head.installments,
  })));
});
export const useFeeHeads = () => feeHeadStore.useValue();

/** Each student's fee account (by student id). */
export const feeAccountStore = remoteStore<Record<number, ApiAccount>>("fee-accounts", {}, async () => {
  const rows = mayRead("fees.read") ? await ifAllowed(api.get<ApiAccount[]>("/fees/accounts"), []) : [];
  return Object.fromEntries(rows.map((a) => [numId("student", a.studentId), a]));
});

const toPayment = (p: ApiPayment): FeePayment => ({
  id: numId("fee-payment", p.id),
  studentId: numId("student", p.studentId),
  installmentId: p.installmentId,
  feeHead: p.feeHead,
  receiptNo: p.receiptNo,
  installment: p.installmentNo,
  amount: p.amount,
  refundedAmount: p.refundedAmount ?? 0,
  netAmount: p.netAmount ?? p.amount,
  status: p.status ?? "SUCCESS",
  lateFee: p.lateFee,
  method: METHOD_LABEL[p.method] ?? p.method,
  txnId: p.gatewayRef || p.receiptNo,
  date: p.paidAt,
});

export const feePaymentStore = remoteStore<FeePayment[]>("fee-payments", [], async () => {
  await feeAccountStore.load();
  if (!mayRead("fees.read")) return [];
  return (await ifAllowed(api.get<ApiPayment[]>("/fees/payments"), [])).map(toPayment);
});
export const useFeePayments = () => {
  feeAccountStore.useValue(); // re-render when accounts arrive
  return feePaymentStore.useValue();
};

export interface FeeHeadInstallmentOption {
  id: string;
  feeHead: string;
  installmentNo: number;
  name: string;
  dueDate: string;
  amount: number;
}

export function feeInstallmentsForStudent(studentId: number): FeeHeadInstallmentOption[] {
  const account = feeAccountStore.get()[studentId];
  if (!account) return [];
  const payments = feePaymentStore.get().filter((payment) => payment.studentId === studentId);
  return account.feeHeads.flatMap((head) => head.installments
    .map((installment) => {
      const collected = payments.filter((payment) => payment.installmentId === installment.id)
        .reduce((sum, payment) => sum + (payment.netAmount ?? payment.amount), 0);
      return {
        id: installment.id, feeHead: head.feeHead, installmentNo: installment.no,
        name: installment.name, dueDate: installment.dueDate, amount: Math.max(0, installment.amount - collected),
      };
    })
    .filter((installment) => installment.amount > 0))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.feeHead.localeCompare(b.feeHead) || a.installmentNo - b.installmentNo);
}

export function billedFeeHeadsAmount(studentId: number): number {
  return feeAccountStore.get()[studentId]?.feeHeads.reduce((sum, head) => sum + head.total, 0) ?? 0;
}

export function setGradeFee(grade: number, amount: number) {
  const g = gradeStore.getAll().find((x) => gradeNo(x.className) === grade && x.id > 0);
  void mutate(feePlanStore, (plan) => ({ ...plan, [grade]: amount }), async () => {
    if (!g) throw new Error(`Class ${grade} is not set up.`);
    await api.put(`/fees/structure/${guidOf("grade", g.id)}`, { annualAmount: amount });
    void feeAccountStore.load(true);
  });
}

export async function saveFeeHead(gradeId: string, feeHead: string, annualAmount: number, installments: FeeHeadPlan["installments"], components: FeeHeadPlan["components"]) {
  await api.put(`/fees/structure/${gradeId}`, {
    feeHead,
    annualAmount,
    components,
    installments: installments.map((item) => ({ ...item })),
  });
  await Promise.all([feeHeadStore.load(true), feePlanStore.load(true), feeAccountStore.load(true)]);
}

export async function saveLateFeeRule(lateFeeRule: LateFeeRule) {
  await api.put("/fees/rules", { lateFeeRule });
  await feeRulesStore.load(true);
}

export async function saveStudentConcession(studentId: number, type: string, percent: number) {
  await api.put(`/fees/students/${guidOf("student", studentId)}/concessions/${type}`, { percent });
  await feeAccountStore.load(true);
}

/** Annual fee after the student's concession. */
export function annualFee(student: Pick<Student, "id" | "class" | "concessionPercent">): number {
  const account = feeAccountStore.get()[student.id];
  if (account) return account.total;
  const base = feePlanStore.get()[parseClassName(student.class).grade] ?? DEFAULT_ANNUAL_FEE;
  const concession = Math.min(100, Math.max(0, Number(student.concessionPercent) || 0));
  return Math.round((base * (100 - concession)) / 100);
}

/** Late fee if paid today. */
export function lateFeeFor(dueDate: string): number {
  return Math.max(0, -daysUntil(dueDate)) * lateFeePerDay;
}

/** Installments of a student (from their account, or the default schedule split equally). */
function scheduleOf(student: Student) {
  const account = feeAccountStore.get()[student.id];
  if (account?.installments.length) return account.installments;
  const total = annualFee(student);
  const each = Math.floor(total / INSTALLMENTS.length);
  return INSTALLMENTS.map((inst, i) => ({ ...inst, amount: i === INSTALLMENTS.length - 1 ? total - each * (INSTALLMENTS.length - 1) : each }));
}

/** A student's fee account: installments with status, totals and payments. */
export function feeAccount(student: Student, payments: FeePayment[]) {
  const total = annualFee(student);
  const mine = payments.filter((p) => p.studentId === student.id && (p.feeHead ?? "TUITION") === "TUITION");
  const installments: Installment[] = scheduleOf(student).map((inst) => {
    const matchingPayments = mine.filter((p) => p.installment === inst.no);
    const payment = matchingPayments[matchingPayments.length - 1];
    const collected = matchingPayments.reduce((sum, p) => sum + (p.netAmount ?? p.amount), 0);
    const status = collected >= inst.amount ? "paid" : daysUntil(inst.dueDate) < 0 ? "overdue" : "pending";
    return {
      no: inst.no,
      name: inst.name,
      amount: inst.amount,
      dueDate: inst.dueDate,
      status,
      lateFee: payment ? payment.lateFee : lateFeeFor(inst.dueDate),
      payment,
    };
  });
  const paid = installments.reduce((sum, inst) => {
    const collected = mine.filter((p) => p.installment === inst.no)
      .reduce((amount, p) => amount + (p.netAmount ?? p.amount), 0);
    return sum + Math.min(inst.amount, collected);
  }, 0);
  const overdue = installments.filter((i) => i.status === "overdue");
  return {
    total,
    paid,
    pending: total - paid,
    overdueAmount: overdue.reduce((a, i) => a + i.amount, 0),
    lateFeesPaid: mine.reduce((a, p) => a + p.lateFee, 0),
    installments,
    payments: [...mine].sort((a, b) => a.date.localeCompare(b.date)),
    status: paid === total ? "Paid" : overdue.length ? "Overdue" : "Pending",
    nextDue: installments.find((i) => i.status !== "paid"),
  } as const;
}

/**
 * Records a payment for an installment: at the counter (staff with fees.collect) or online by the
 * student / parent. The server works out the amount and late fee and issues the receipt number.
 * Resolves to the saved payment, or undefined if it was refused (the reason is shown).
 */
export async function payInstallment(student: Student, installment: number, method: string): Promise<FeePayment | undefined> {
  const account = feeAccount(student, feePaymentStore.get());
  const inst = account.installments.find((i) => i.no === installment);
  if (!inst || inst.status === "paid") throw new Error("Installment already paid");
  const id = tempId();
  const pending: FeePayment = { id, studentId: student.id, installment, feeHead: "TUITION", amount: inst.amount, lateFee: inst.lateFee, method, txnId: "", date: new Date().toISOString().slice(0, 10) };
  const key = crypto.randomUUID();
  const saved = await mutate(feePaymentStore, (list) => [...list, pending], () =>
    api.post<ApiPayment>("/fees/payments", { studentId: guidOf("student", student.id), installmentNo: installment, method }, { headers: { "Idempotency-Key": key } }),
  );
  if (!saved) return undefined;
  const payment = toPayment(saved);
  feePaymentStore.set((list) => list.map((p) => (p.id === id ? payment : p)));
  return payment;
}

export async function payFeeHeadInstallment(student: Student, installmentId: string, method: string): Promise<FeePayment | undefined> {
  const installment = feeInstallmentsForStudent(student.id).find((item) => item.id === installmentId);
  if (!installment) throw new Error("This fee installment is already paid or unavailable.");
  const id = tempId();
  const pending: FeePayment = {
    id, studentId: student.id, installmentId, installment: installment.installmentNo, feeHead: installment.feeHead,
    amount: installment.amount, lateFee: 0, method, txnId: "", date: new Date().toISOString().slice(0, 10),
  };
  const key = crypto.randomUUID();
  const saved = await mutate(feePaymentStore, (list) => [...list, pending], () =>
    api.post<ApiPayment>("/fees/payments", { studentId: guidOf("student", student.id), installmentId, method }, { headers: { "Idempotency-Key": key } }),
  );
  if (!saved) return undefined;
  const payment = toPayment(saved);
  feePaymentStore.set((list) => list.map((item) => (item.id === id ? payment : item)));
  return payment;
}

export async function refundFeePayment(payment: FeePayment, amount: number, reason: string, method = "BANK_TRANSFER") {
  if (!payment.installmentId) throw new Error("This payment cannot be refunded from the fee register.");
  await api.post(`/fees/payments/${guidOf("fee-payment", payment.id)}/refunds`, {
    amount, method, reason,
  });
  await Promise.all([feePaymentStore.load(true), feeAccountStore.load(true)]);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] ?? character));

export async function printFeeReceipt(payment: FeePayment) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to open the printable receipt.");
  try {
    const receipt = await api.get<ApiFeeReceipt>(`/fees/payments/${guidOf("fee-payment", payment.id)}/receipt`);
    const refundRows = receipt.refunds.map((refund) =>
      `<tr><td>${escapeHtml(refund.refundNo)}</td><td>${escapeHtml(refund.refundedAt ?? "")}</td><td>₹${refund.amount.toFixed(2)}</td><td>${escapeHtml(refund.reason)}</td></tr>`,
    ).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Receipt ${escapeHtml(receipt.receiptNo)}</title><style>
      body{font:14px Arial,sans-serif;max-width:720px;margin:40px auto;color:#222}h1{font-size:22px}
      .row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:10px 0}
      table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;border:1px solid #ddd;padding:8px}
      @media print{button{display:none}}
    </style></head><body><h1>Fee Payment Receipt</h1>
      <div class="row"><strong>Receipt</strong><span>${escapeHtml(receipt.receiptNo)}</span></div>
      <div class="row"><strong>Student</strong><span>${escapeHtml(receipt.studentName)} (${escapeHtml(receipt.rollNo)})</span></div>
      <div class="row"><strong>Fee</strong><span>${escapeHtml(receipt.feeHead.replaceAll("_", " "))} · Installment ${receipt.installmentNo}</span></div>
      <div class="row"><strong>Paid on</strong><span>${escapeHtml(receipt.paidAt ?? "")}</span></div>
      <div class="row"><strong>Payment method</strong><span>${escapeHtml(receipt.method)}</span></div>
      <div class="row"><strong>Fee amount</strong><span>₹${receipt.amount.toFixed(2)}</span></div>
      <div class="row"><strong>Late fee</strong><span>₹${receipt.lateFee.toFixed(2)}</span></div>
      <div class="row"><strong>Refunded</strong><span>₹${receipt.refundedAmount.toFixed(2)}</span></div>
      ${receipt.reference ? `<div class="row"><strong>Reference</strong><span>${escapeHtml(receipt.reference)}</span></div>` : ""}
      ${refundRows ? `<h2>Refund history</h2><table><thead><tr><th>Refund</th><th>Date</th><th>Amount</th><th>Reason</th></tr></thead><tbody>${refundRows}</tbody></table>` : ""}
      <p><button onclick="window.print()">Print / Save as PDF</button></p></body></html>`);
    printWindow.document.close();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
