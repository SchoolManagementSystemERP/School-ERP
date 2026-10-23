import { daysFromToday } from "@/lib/dates";

/** Annual tuition by grade (₹), before concessions. */
export const ANNUAL_FEE_BY_GRADE: Record<number, number> = { 8: 42000, 9: 45000, 10: 48000, 11: 54000, 12: 57000 };
export const DEFAULT_ANNUAL_FEE = 45000;

/** Installment plan: name and due date (days from today, so the demo always has one coming up). */
export const INSTALLMENTS = [
  { name: "First Installment", dueInDays: -150 },
  { name: "Second Installment", dueInDays: -20 },
  { name: "Third Installment", dueInDays: 40 },
].map((i, idx) => ({ no: idx + 1, name: i.name, dueDate: daysFromToday(i.dueInDays) }));

/** ₹ per day after the due date. */
export const LATE_FEE_PER_DAY = 100;
