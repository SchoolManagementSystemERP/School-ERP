import { daysUntil } from "./dates";

const parse = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00`);

/** "2026-10-19" → "19 Oct 2026" */
export const fmtDate = (date: string) =>
  date ? parse(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** "2026-10-19" → "19 Oct" */
export const fmtDay = (date: string) => (date ? parse(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");

/** "2026-10-19" → "Mon, 19 Oct" */
export const fmtWeekday = (date: string) =>
  date ? parse(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "—";

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago" */
export function relativeDay(date: string): string {
  const n = daysUntil(date.slice(0, 10));
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** ₹48,000 */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** "Good morning" / "Good afternoon" / "Good evening" for the current time. */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Minutes since midnight for "08:45". */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
