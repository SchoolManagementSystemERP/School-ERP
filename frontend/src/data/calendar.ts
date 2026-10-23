export interface Holiday {
  name: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD (same as start for one-day holidays) */
  end: string;
  type: "national" | "vacation" | "school";
}

/** Academic year (April–March) that contains today, e.g. 2026 for Apr 2026 – Mar 2027. */
export function academicYearStart(d = new Date()): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Fixed-date holidays and school breaks for the academic year containing today. */
export function holidaysForCurrentYear(): Holiday[] {
  const y = academicYearStart();
  const n = y + 1;
  const day = (yr: number, m: number, d: number) => `${yr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const one = (name: string, date: string, type: Holiday["type"] = "national"): Holiday => ({ name, start: date, end: date, type });
  return [
    one("Ambedkar Jayanti", day(y, 4, 14)),
    one("Labour Day", day(y, 5, 1)),
    { name: "Summer Vacation", start: day(y, 5, 20), end: day(y, 6, 30), type: "vacation" },
    one("Independence Day", day(y, 8, 15)),
    one("Teachers' Day (half day)", day(y, 9, 5), "school"),
    one("Gandhi Jayanti", day(y, 10, 2)),
    { name: "Autumn Break", start: day(y, 10, 20), end: day(y, 10, 24), type: "vacation" },
    one("Children's Day (celebration)", day(y, 11, 14), "school"),
    one("Christmas", day(y, 12, 25)),
    { name: "Winter Break", start: day(y, 12, 26), end: day(n, 1, 5), type: "vacation" },
    one("Republic Day", day(n, 1, 26)),
    one("Annual Day", day(n, 2, 14), "school"),
  ];
}
