import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { today } from "@/lib/dates";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";

export interface Expense {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  description: string;
  amount: number;
  paidTo: string;
  method: string;
}

export const EXPENSE_CATEGORIES = ["Electricity", "Water", "Internet", "Maintenance", "Stationery", "Transport Fuel", "Events", "Lab Supplies", "Cleaning", "Other"];
export const PAYMENT_METHODS = ["Bank Transfer", "UPI", "Cheque", "Cash"];

interface ApiExpense { id: string; date: string; category: string; description: string; amount: number; paidTo: string | null; method: string; fromPurchase: boolean }

const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank Transfer", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", CARD: "Card" };
const toExpense = (e: ApiExpense): Expense => ({
  id: numId("expense", e.id), date: e.date, category: e.category, description: e.description, amount: e.amount,
  paidTo: e.paidTo ?? "", method: METHOD_LABEL[e.method] ?? e.method,
});

/** Expenses of the current academic year, from the API (GET /expenses) — including purchase payments. */
export const expenseStore = remoteStore<Expense[]>("expenses", [], async () =>
  canAny("expenses.write", "reports.view") ? (await ifAllowed(api.get<ApiExpense[]>("/expenses"), [])).map(toExpense) : []);
export const useExpenses = () => expenseStore.useValue();

export function addExpense(e: Omit<Expense, "id">) {
  const id = tempId();
  void mutate(expenseStore, (list) => [{ ...e, id }, ...list], async () => {
    const saved = await api.post<ApiExpense>("/expenses", { ...e, paidTo: e.paidTo || null });
    expenseStore.set((list) => list.map((x) => (x.id === id ? toExpense(saved) : x)));
  });
}

export function removeExpense(id: number) {
  void mutate(expenseStore, (list) => list.filter((e) => e.id !== id), () => api.del(`/expenses/${guidOf("expense", id)}`));
}

/** "YYYY-MM" of a date, or of today. */
export const monthOf = (date = today()) => date.slice(0, 7);

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
