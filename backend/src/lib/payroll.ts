import type { Tx } from '../db/prisma.js';
import { parseJson } from './http.js';

/**
 * Salary rules in one place: the CTC annexure of an offer, the monthly payslip and the full & final
 * settlement all use these functions, so they always agree.
 *
 * Defaults follow common Indian practice and can be changed per school in Organization.settings.hr:
 *  - PF: 12 % (employee and employer) of basic + DA, capped at the ₹15,000 wage ceiling
 *  - ESI: 0.75 % employee / 3.25 % employer, only while monthly gross is ₹21,000 or less
 *  - Professional tax: monthly slabs on gross (state-specific — set the school's state slabs)
 *  - Income tax (TDS): new regime, FY 2025-26 slabs, ₹75,000 standard deduction, rebate up to ₹12 lakh, 4 % cess
 *  - Gratuity provision: 4.81 % of basic; leave encashment: (basic + DA) / 26 per day
 */

export interface HrSettings {
  basicPercent: number; // of CTC
  hraPercentOfBasic: number;
  pfRate: number;
  pfWageCeiling: number;
  pfOnActualBasic: boolean; // true = PF on full basic instead of the ceiling
  esiWageCeiling: number;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  gratuityPercent: number;
  professionalTax: { from: number; amount: number }[]; // monthly gross from → tax
  leavePolicy: Record<string, number>; // days per year by leave type
  noticeDays: number;
  encashmentDivisor: number;
  bonusPercent: number; // statutory bonus on basic for eligible staff
  bonusWageCeiling: number; // monthly gross up to which bonus applies
}

export const DEFAULT_HR_SETTINGS: HrSettings = {
  basicPercent: 40,
  hraPercentOfBasic: 50,
  pfRate: 12,
  pfWageCeiling: 15000,
  pfOnActualBasic: false,
  esiWageCeiling: 21000,
  esiEmployeeRate: 0.75,
  esiEmployerRate: 3.25,
  gratuityPercent: 4.81,
  professionalTax: [{ from: 0, amount: 0 }, { from: 15000, amount: 200 }],
  leavePolicy: { CASUAL: 12, SICK: 10, EARNED: 15 },
  noticeDays: 30,
  encashmentDivisor: 26,
  bonusPercent: 8.33,
  bonusWageCeiling: 21000,
};

export async function hrSettings(tx: Tx, organizationId: string): Promise<HrSettings> {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const saved = ((parseJson(org.settings) ?? {}) as { hr?: Partial<HrSettings> }).hr ?? {};
  return { ...DEFAULT_HR_SETTINGS, ...saved, leavePolicy: { ...DEFAULT_HR_SETTINGS.leavePolicy, ...(saved.leavePolicy ?? {}) } };
}

const r = (n: number) => Math.round(n);

/** Monthly salary components (what a payslip pays when every day is paid). */
export interface Components { basic: number; hra: number; da: number; ta: number; special: number }

export const grossOf = (c: Components) => c.basic + c.hra + c.da + c.ta + c.special;

export function professionalTax(monthlyGross: number, s: HrSettings) {
  return [...s.professionalTax].sort((a, b) => a.from - b.from).reduce((tax, slab) => (monthlyGross >= slab.from ? slab.amount : tax), 0);
}

const pfWage = (basicPlusDa: number, s: HrSettings) => (s.pfOnActualBasic ? basicPlusDa : Math.min(basicPlusDa, s.pfWageCeiling));
export const employeePf = (basicPlusDa: number, s: HrSettings) => r((pfWage(basicPlusDa, s) * s.pfRate) / 100);
export const employerPf = employeePf;
export const esiApplies = (monthlyGross: number, s: HrSettings) => monthlyGross > 0 && monthlyGross <= s.esiWageCeiling;

/** Income tax for a year under the new regime (FY 2025-26), after the standard deduction; includes 4 % cess. */
export function annualIncomeTax(annualGross: number) {
  const taxable = Math.max(0, annualGross - 75000);
  const slabs: [number, number][] = [[400000, 0], [800000, 5], [1200000, 10], [1600000, 15], [2000000, 20], [2400000, 25], [Infinity, 30]];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of slabs) {
    if (taxable > lower) tax += ((Math.min(taxable, upper) - lower) * rate) / 100;
    lower = upper;
  }
  if (taxable <= 1200000) tax = 0; // section 87A rebate
  else tax = Math.min(tax, taxable - 1200000); // marginal relief just above ₹12 lakh
  return r(tax * 1.04);
}

/** Splits an annual CTC into components (the offer annexure). */
export function ctcBreakdown(ctcAnnual: number, s: HrSettings, overrides: { basicPercent?: number; hraPercentOfBasic?: number } = {}) {
  const monthlyCtc = ctcAnnual / 12;
  const basic = r((monthlyCtc * (overrides.basicPercent ?? s.basicPercent)) / 100);
  const hra = r((basic * (overrides.hraPercentOfBasic ?? s.hraPercentOfBasic)) / 100);
  const pfEmployer = employerPf(basic, s);
  const gratuity = r((basic * s.gratuityPercent) / 100);
  // special allowance balances the CTC; ESI (employer) is part of the cost while gross stays under the ceiling
  let special = Math.max(0, r(monthlyCtc - basic - hra - pfEmployer - gratuity));
  let gross = basic + hra + special;
  let esiEmployer = 0;
  if (esiApplies(gross, s)) {
    // gross + 3.25 % of gross must fit in what is left of the CTC
    gross = r((monthlyCtc - pfEmployer - gratuity) / (1 + s.esiEmployerRate / 100));
    special = Math.max(0, gross - basic - hra);
    gross = basic + hra + special;
    esiEmployer = esiApplies(gross, s) ? Math.ceil((gross * s.esiEmployerRate) / 100) : 0;
  }
  const monthly: Components = { basic, hra, da: 0, ta: 0, special };
  const pfEmployee = employeePf(basic, s);
  const esiEmployee = esiApplies(gross, s) ? Math.ceil((gross * s.esiEmployeeRate) / 100) : 0;
  const pt = professionalTax(gross, s);
  const tds = r(annualIncomeTax(gross * 12) / 12);
  return {
    ctcAnnual: r(ctcAnnual),
    monthly,
    grossMonthly: gross,
    employer: { pf: pfEmployer, esi: esiEmployer, gratuity },
    deductions: { pf: pfEmployee, esi: esiEmployee, pt, tds },
    netMonthly: gross - pfEmployee - esiEmployee - pt - tds,
    annual: {
      basic: basic * 12, hra: hra * 12, special: special * 12, gross: gross * 12,
      pfEmployer: pfEmployer * 12, esiEmployer: esiEmployer * 12, gratuity: gratuity * 12,
      ctc: (gross + pfEmployer + esiEmployer + gratuity) * 12,
    },
  };
}
export type CtcBreakdown = ReturnType<typeof ctcBreakdown>;

/** Monthly components of a staff member: from their saved compensation, else from basic salary + allowances. */
export function componentsOf(staff: { basicSalary: unknown; allowances: string | null; compensation: string | null }): Components {
  const comp = parseJson(staff.compensation) as { monthly?: Partial<Components> } | null;
  if (comp?.monthly) {
    const m = comp.monthly;
    return { basic: m.basic ?? 0, hra: m.hra ?? 0, da: m.da ?? 0, ta: m.ta ?? 0, special: m.special ?? 0 };
  }
  const a = (parseJson(staff.allowances) ?? {}) as Record<string, number | null>;
  return { basic: Number(staff.basicSalary ?? 0), hra: Number(a.hra ?? 0), da: Number(a.da ?? 0), ta: Number(a.ta ?? 0), special: Number(a.other ?? 0) };
}

/**
 * One month's payslip. `lopDays` (loss of pay) reduce every component pro rata; reimbursements are added
 * untaxed. Deductions: employee PF, ESI, professional tax and TDS.
 */
export function monthlyPayslip(c: Components, s: HrSettings, opts: { daysInMonth: number; lopDays: number; reimbursement?: number }) {
  const fullGross = grossOf(c);
  const paidDays = Math.max(0, opts.daysInMonth - opts.lopDays);
  const f = opts.daysInMonth ? paidDays / opts.daysInMonth : 0;
  const earned: Components = { basic: r(c.basic * f), hra: r(c.hra * f), da: r(c.da * f), ta: r(c.ta * f), special: r(c.special * f) };
  const gross = grossOf(earned);
  const pf = gross > 0 ? employeePf(earned.basic + earned.da, s) : 0;
  const esi = esiApplies(fullGross, s) && gross > 0 ? Math.ceil((gross * s.esiEmployeeRate) / 100) : 0;
  const pt = gross > 0 ? professionalTax(gross, s) : 0;
  const tds = gross > 0 ? r(annualIncomeTax(fullGross * 12) / 12) : 0;
  const reimbursement = r(opts.reimbursement ?? 0);
  const deductions = pf + esi + pt + tds;
  return {
    daysInMonth: opts.daysInMonth, lopDays: opts.lopDays, paidDays,
    earnings: { ...earned, reimbursement },
    deductionsDetail: { pf, esi, pt, tds },
    employer: { pf: gross > 0 ? employerPf(earned.basic + earned.da, s) : 0, esi: esiApplies(fullGross, s) && gross > 0 ? Math.ceil((gross * s.esiEmployerRate) / 100) : 0 },
    gross: gross + reimbursement,
    deductions,
    net: gross + reimbursement - deductions,
  };
}
export type MonthlyPayslip = ReturnType<typeof monthlyPayslip>;
