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
  grades: { gradeId: string; grade: string; annualAmount: number | null; installments: { no: number; name: string; dueDate: string; percent: number }[] }[];
}
interface ApiAccount {
  studentId: string; annualFee: number; concessionPercent: number; total: number;
  installments: { no: number; name: string; dueDate: string; amount: number }[];
}
interface ApiPayment { id: string; studentId: string; installmentNo: number; amount: number; lateFee: number; method: string; receiptNo: string; gatewayRef: string | null; paidAt: string }

const METHOD_LABEL: Record<string, string> = { UPI: "UPI", CARD: "Card", NETBANKING: "Net Banking", CASH: "Cash", CHEQUE: "Cheque" };
const gradeNo = (name: string) => Number(name.replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

let lateFeePerDay = LATE_FEE_PER_DAY;

export interface FeeRules { lateFeePerDay: number; installments: { no: number; name: string; dueDate: string; percent: number }[] }

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
export const feeRulesStore = remoteStore<FeeRules>("fee-rules", { lateFeePerDay: LATE_FEE_PER_DAY, installments: [] }, async () => {
  const s = await fetchStructure();
  return { lateFeePerDay: s.lateFeePerDay, installments: s.grades.find((g) => g.installments.length)?.installments ?? [] };
});
export const useFeeRules = () => feeRulesStore.useValue();

/** Each student's fee account (by student id). */
export const feeAccountStore = remoteStore<Record<number, ApiAccount>>("fee-accounts", {}, async () => {
  const rows = mayRead("fees.read") ? await ifAllowed(api.get<ApiAccount[]>("/fees/accounts"), []) : [];
  return Object.fromEntries(rows.map((a) => [numId("student", a.studentId), a]));
});

const toPayment = (p: ApiPayment): FeePayment => ({
  id: numId("fee-payment", p.id),
  studentId: numId("student", p.studentId),
  installment: p.installmentNo,
  amount: p.amount,
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

export function setGradeFee(grade: number, amount: number) {
  const g = gradeStore.getAll().find((x) => gradeNo(x.className) === grade && x.id > 0);
  void mutate(feePlanStore, (plan) => ({ ...plan, [grade]: amount }), async () => {
    if (!g) throw new Error(`Class ${grade} is not set up.`);
    await api.put(`/fees/structure/${guidOf("grade", g.id)}`, { annualAmount: amount });
    void feeAccountStore.load(true);
  });
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
  const mine = payments.filter((p) => p.studentId === student.id);
  const installments: Installment[] = scheduleOf(student).map((inst) => {
    const payment = mine.find((p) => p.installment === inst.no);
    const status = payment ? "paid" : daysUntil(inst.dueDate) < 0 ? "overdue" : "pending";
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
  const paid = installments.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0);
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
  const pending: FeePayment = { id, studentId: student.id, installment, amount: inst.amount, lateFee: inst.lateFee, method, txnId: "", date: new Date().toISOString().slice(0, 10) };
  const key = crypto.randomUUID();
  const saved = await mutate(feePaymentStore, (list) => [...list, pending], () =>
    api.post<ApiPayment>("/fees/payments", { studentId: guidOf("student", student.id), installmentNo: installment, method }, { headers: { "Idempotency-Key": key } }),
  );
  if (!saved) return undefined;
  const payment = toPayment(saved);
  feePaymentStore.set((list) => list.map((p) => (p.id === id ? payment : p)));
  return payment;
}
