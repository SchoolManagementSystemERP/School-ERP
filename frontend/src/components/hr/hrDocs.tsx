/**
 * HR documents shared by the HR portal and employee self-service: the CTC annexure, offer letter,
 * payslip and exit letters — on screen and as printable A4 pages.
 */
import { escapeHtml as e, inrText as inr } from "@/lib/print";
import { fmtDate } from "@/lib/format";

export interface CtcBreakdown {
  ctcAnnual: number;
  monthly: { basic: number; hra: number; da: number; ta: number; special: number };
  grossMonthly: number;
  employer: { pf: number; esi: number; gratuity: number };
  deductions: { pf: number; esi: number; pt: number; tds: number };
  netMonthly: number;
  annual: { basic: number; hra: number; special: number; gross: number; pfEmployer: number; esiEmployer: number; gratuity: number; ctc: number };
}

export interface PayslipDetail {
  id: string; month: string; status: string; paidAt: string | null;
  school: { name: string; address: string; city: string };
  staff: { name: string; employeeCode: string; designation: string; department: string | null; joiningDate: string | null };
  gross: number; deductions: number; net: number;
  breakdown: {
    daysInMonth: number; lopDays: number; paidDays: number;
    earnings: { basic: number; hra: number; da: number; ta: number; special: number; reimbursement: number };
    deductionsDetail?: { pf: number; esi: number; pt: number; tds: number };
    employer?: { pf: number; esi: number };
    // payslips made before the statutory engine kept only these
    basic?: number; pf?: number; professionalTax?: number;
  };
}

export interface ExitDocs {
  school: { name: string; address: string; city: string; state: string; phone: string | null; email: string | null };
  principalName: string;
  employee: { name: string; employeeCode: string; designation: string; department: string | null; joiningDate: string | null; gender: string | null };
  separation: { type: string; noticeDate: string; lastWorkingDay: string; reason: string; letter: string | null; status: string; settledAt: string | null };
  available: { resignationLetter: boolean; acceptanceLetter: boolean; experienceCertificate: boolean; relievingLetter: boolean };
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

/** Rows of the CTC annexure (monthly, annual). */
export function ctcRows(b: CtcBreakdown) {
  return {
    earnings: [
      ["Basic salary", b.monthly.basic], ["House rent allowance (HRA)", b.monthly.hra], ...(b.monthly.da ? [["Dearness allowance", b.monthly.da] as [string, number]] : []),
      ...(b.monthly.ta ? [["Transport allowance", b.monthly.ta] as [string, number]] : []), ["Special allowance", b.monthly.special],
    ] as [string, number][],
    employer: [["Employer PF (12%)", b.employer.pf], ...(b.employer.esi ? [["Employer ESI (3.25%)", b.employer.esi] as [string, number]] : []), ["Gratuity (4.81% of basic)", b.employer.gratuity]] as [string, number][],
    deductions: [["Employee PF (12%)", b.deductions.pf], ...(b.deductions.esi ? [["Employee ESI (0.75%)", b.deductions.esi] as [string, number]] : []), ["Professional tax", b.deductions.pt], ["Income tax (TDS, estimate)", b.deductions.tds]] as [string, number][],
  };
}

/** The CTC annexure on screen. */
export function CtcTable({ b }: { b: CtcBreakdown }) {
  const rows = ctcRows(b);
  const Row = ({ label, m, strong }: { label: string; m: number; strong?: boolean }) => (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="py-1.5 pr-3 text-foreground">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{inr(m)}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{inr(m * 12)}</td>
    </tr>
  );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground"><th className="py-1.5 text-left font-medium">Component</th><th className="py-1.5 text-right font-medium">Monthly</th><th className="py-1.5 pl-3 text-right font-medium">Annual</th></tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {rows.earnings.map(([l, m]) => <Row key={l} label={l} m={m} />)}
        <Row label="Gross salary" m={b.grossMonthly} strong />
        {rows.employer.map(([l, m]) => <Row key={l} label={l} m={m} />)}
        <Row label="Cost to company (CTC)" m={b.annual.ctc / 12} strong />
        {rows.deductions.map(([l, m]) => <Row key={l} label={`− ${l}`} m={m} />)}
        <Row label="Estimated take-home" m={b.netMonthly} strong />
      </tbody>
    </table>
  );
}

const tableHtml = (b: CtcBreakdown) => {
  const rows = ctcRows(b);
  const tr = (l: string, m: number, cls = "") => `<tr class="${cls}"><td>${e(l)}</td><td class="num">${inr(m)}</td><td class="num">${inr(m * 12)}</td></tr>`;
  return `<table><thead><tr><th>Component</th><th class="num">Monthly</th><th class="num">Annual</th></tr></thead><tbody>
    ${rows.earnings.map(([l, m]) => tr(l, m)).join("")}${tr("Gross salary", b.grossMonthly, "total")}
    ${rows.employer.map(([l, m]) => tr(l, m)).join("")}${tr("Cost to company (CTC)", b.annual.ctc / 12, "total")}
    ${rows.deductions.map(([l, m]) => tr(`Less: ${l}`, m)).join("")}${tr("Estimated take-home", b.netMonthly, "total")}
  </tbody></table>`;
};

const header = (school: { name: string; address?: string; city?: string }) =>
  `<div class="head"><h1>${e(school.name)}</h1><div class="muted">${e([school.address, school.city].filter(Boolean).join(", "))}</div></div>`;

export interface OfferForLetter {
  letterNo: string; designation: string; department: string; employmentType: string; joiningDate: string; validTill: string; createdAt: string;
  ctcAnnual: number; breakdown: CtcBreakdown; candidate: { name: string; email: string; phone: string } | null;
}

export function offerLetterHtml(o: OfferForLetter, school: { name: string; address?: string; city?: string }) {
  const name = o.candidate?.name ?? "Candidate";
  return `${header(school)}
    <p class="right">Ref: ${e(o.letterNo)}<br/>Date: ${fmtDate(o.createdAt.slice(0, 10))}</p>
    <p>${e(name)}<br/>${e(o.candidate?.email ?? "")} · ${e(o.candidate?.phone ?? "")}</p>
    <p><strong>Subject: Offer of appointment — ${e(o.designation)}</strong></p>
    <p>Dear ${e(name.split(" ")[0])},</p>
    <p>We are pleased to offer you the position of <strong>${e(o.designation)}</strong> in the ${e(o.department)} department at ${e(school.name)},
    on a ${e(o.employmentType.toLowerCase().replace("_", "-"))} basis, with an annual cost to company (CTC) of <strong>${inr(o.ctcAnnual)}</strong>.
    The break-up of your compensation is given in Annexure A.</p>
    <p>Your date of joining will be <strong>${fmtDate(o.joiningDate)}</strong>. Please bring the originals and copies of your identity proof,
    PAN, educational certificates, previous employment / relieving letters and two passport-size photographs on the day of joining.</p>
    <p>This offer is subject to satisfactory background verification and is valid until <strong>${fmtDate(o.validTill)}</strong>.
    Please sign and return a copy of this letter to confirm your acceptance.</p>
    <p>We look forward to welcoming you to our school.</p>
    <div class="sign"><div>For ${e(school.name)}<br/><br/><br/>Authorised signatory</div><div>Accepted<br/><br/><br/>${e(name)}</div></div>
    <h2 style="page-break-before: always">Annexure A — Compensation (CTC ${inr(o.ctcAnnual)} per year)</h2>
    ${tableHtml(o.breakdown)}
    <p class="muted">PF and ESI as per statute. Income tax is an estimate under the new tax regime and depends on your declarations.
    Gratuity is payable on completion of five years of service as per the Payment of Gratuity Act.</p>`;
}

/** Earnings / deductions of a payslip (handles payslips made before the statutory engine). */
export function payslipLines(p: PayslipDetail) {
  const b = p.breakdown;
  const earnings: [string, number][] = [
    ["Basic", b.earnings?.basic ?? b.basic ?? 0], ["HRA", b.earnings?.hra ?? 0], ["DA", b.earnings?.da ?? 0], ["Transport allowance", b.earnings?.ta ?? 0],
    ["Special allowance", b.earnings?.special ?? 0], ["Reimbursements", b.earnings?.reimbursement ?? 0],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];
  const d = b.deductionsDetail;
  const deductions: [string, number][] = (d
    ? [["Provident fund", d.pf], ["ESI", d.esi], ["Professional tax", d.pt], ["Income tax (TDS)", d.tds]]
    : [["Provident fund", b.pf ?? 0], ["Professional tax", b.professionalTax ?? 0]]).filter(([, v]) => (v as number) > 0) as [string, number][];
  return { earnings, deductions };
}

export function payslipHtml(p: PayslipDetail) {
  const { earnings, deductions } = payslipLines(p);
  const n = Math.max(earnings.length, deductions.length);
  const rows = Array.from({ length: n }, (_, i) => `<tr><td>${e(earnings[i]?.[0] ?? "")}</td><td class="num">${earnings[i] ? inr(earnings[i][1]) : ""}</td><td>${e(deductions[i]?.[0] ?? "")}</td><td class="num">${deductions[i] ? inr(deductions[i][1]) : ""}</td></tr>`).join("");
  return `${header(p.school)}
    <h2 class="center">Payslip for ${monthLabel(p.month)}</h2>
    <table><tbody>
      <tr><td>Employee</td><td>${e(p.staff.name)} (${e(p.staff.employeeCode)})</td><td>Designation</td><td>${e(p.staff.designation)}</td></tr>
      <tr><td>Department</td><td>${e(p.staff.department ?? "—")}</td><td>Date of joining</td><td>${p.staff.joiningDate ? fmtDate(p.staff.joiningDate) : "—"}</td></tr>
      <tr><td>Days in month</td><td>${p.breakdown.daysInMonth ?? "—"}</td><td>Paid days (LOP)</td><td>${p.breakdown.paidDays ?? "—"} (${p.breakdown.lopDays ?? 0})</td></tr>
    </tbody></table>
    <table><thead><tr><th>Earnings</th><th class="num">Amount</th><th>Deductions</th><th class="num">Amount</th></tr></thead><tbody>
      ${rows}
      <tr class="total"><td>Total earnings</td><td class="num">${inr(p.gross)}</td><td>Total deductions</td><td class="num">${inr(p.deductions)}</td></tr>
    </tbody></table>
    <p><strong>Net pay: ${inr(p.net)}</strong>${p.paidAt ? ` · paid on ${fmtDate(p.paidAt)}` : " · not paid yet"}</p>
    <p class="muted">This is a computer-generated payslip and needs no signature.</p>`;
}

/** [possessive, subject, object] pronouns. */
const pronoun = (g: string | null) => (g === "FEMALE" ? ["her", "she", "her"] : g === "MALE" ? ["his", "he", "him"] : ["their", "they", "them"]);
const title = (g: string | null) => (g === "FEMALE" ? "Ms." : g === "MALE" ? "Mr." : "");

export function experienceCertificateHtml(d: ExitDocs) {
  const [his, he, him] = pronoun(d.employee.gender);
  const name = `${title(d.employee.gender)} ${d.employee.name}`.trim();
  return `${header(d.school)}
    <p class="right">Date: ${fmtDate(d.separation.settledAt?.slice(0, 10) ?? d.separation.lastWorkingDay)}</p>
    <h2 class="center">EXPERIENCE CERTIFICATE</h2>
    <p>This is to certify that <strong>${e(name)}</strong> (Employee code ${e(d.employee.employeeCode)}) worked with ${e(d.school.name)}
    as <strong>${e(d.employee.designation)}</strong>${d.employee.department ? ` in the ${e(d.employee.department)} department` : ""}
    from <strong>${d.employee.joiningDate ? fmtDate(d.employee.joiningDate) : "—"}</strong> to <strong>${fmtDate(d.separation.lastWorkingDay)}</strong>.</p>
    <p>During ${his} tenure ${he} ${he === "they" ? "were" : "was"} sincere and hard-working. We wish ${him} every success in the future.</p>
    <div class="sign"><div>${e(d.principalName)}<br/>Principal, ${e(d.school.name)}</div></div>`;
}

export function relievingLetterHtml(d: ExitDocs) {
  const name = `${title(d.employee.gender)} ${d.employee.name}`.trim();
  return `${header(d.school)}
    <p class="right">Date: ${fmtDate(d.separation.settledAt?.slice(0, 10) ?? d.separation.lastWorkingDay)}</p>
    <p>${e(name)}<br/>Employee code ${e(d.employee.employeeCode)}</p>
    <h2>Subject: Relieving letter</h2>
    <p>Dear ${e(d.employee.name.split(" ")[0])},</p>
    <p>${d.separation.type === "RESIGNATION" ? `With reference to your resignation dated ${fmtDate(d.separation.noticeDate)}, you` : "You"} are relieved from the services of
    ${e(d.school.name)} as ${e(d.employee.designation)} at the close of working hours on <strong>${fmtDate(d.separation.lastWorkingDay)}</strong>.</p>
    <p>Your full and final settlement has been completed and you have handed over all school property and records in your charge.</p>
    <p>We thank you for your contribution and wish you the very best.</p>
    <div class="sign"><div>${e(d.principalName)}<br/>Principal, ${e(d.school.name)}</div></div>`;
}

export function acceptanceLetterHtml(d: ExitDocs) {
  return `${header(d.school)}
    <p class="right">Date: ${fmtDate(d.separation.noticeDate)}</p>
    <p>${e(d.employee.name)}<br/>${e(d.employee.designation)} · ${e(d.employee.employeeCode)}</p>
    <h2>Subject: Acceptance of ${d.separation.type === "RESIGNATION" ? "resignation" : "separation"}</h2>
    <p>Dear ${e(d.employee.name.split(" ")[0])},</p>
    <p>${d.separation.type === "RESIGNATION" ? `Your resignation dated ${fmtDate(d.separation.noticeDate)} has been accepted.` : "This is to confirm your separation from the school."}
    Your last working day will be <strong>${fmtDate(d.separation.lastWorkingDay)}</strong>.</p>
    <p>Please complete the handover of your responsibilities, records and school property before your last working day.
    Your full and final settlement will be processed after the handover.</p>
    <div class="sign"><div>${e(d.principalName)}<br/>Principal, ${e(d.school.name)}</div></div>`;
}

export function resignationLetterHtml(d: ExitDocs) {
  return `<p class="right">Date: ${fmtDate(d.separation.noticeDate)}</p>
    <p>To<br/>The Principal<br/>${e(d.school.name)}</p>
    <h2>Subject: Resignation</h2>
    <div style="white-space: pre-wrap">${e(d.separation.letter ?? d.separation.reason)}</div>
    <div class="sign"><div>${e(d.employee.name)}<br/>${e(d.employee.designation)} · ${e(d.employee.employeeCode)}</div></div>`;
}
