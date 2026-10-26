/**
 * HR suite and stock analysis over HTTP, against the "greenwood" demo organization:
 *   npm run test:hrms
 * Recruitment → offer (CTC annexure) → joining → onboarding; attendance, claims, payroll with statutory
 * deductions, payslips and compliance; training with tests and MIS; exit with full & final to Accounts;
 * vendor codes and stock analysis. Everything it creates is removed at the end.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";
import { annualIncomeTax } from "../src/lib/payroll.js";

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ✓" : "  ✗"} ${label}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string, password = "Demo@1234") {
  const r = await call(null, "POST", "/auth/login", { organization: "greenwood", username, password });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const TAG = `hrms-test-${Date.now()}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const month = new Date().toISOString().slice(0, 7);
const created = { applicationIds: [] as string[], staffIds: [] as string[], userIds: [] as string[], trainingIds: [] as string[], claimIds: [] as string[], vendorIds: [] as string[], payrollRunId: "", attendance: [] as { staffId: string; date: string }[], expenseIds: [] as string[], compensationBackup: null as null | { id: string; compensation: string | null; basicSalary: unknown; allowances: string | null } };

async function main() {
  const hr = await login("hr");
  const principal = await login("principal");
  const accountant = await login("accountant");
  const teacher = await login("T002");
  const store = await login("inventory");
  const priyaId: string = (await call(teacher, "GET", "/me")).body.staff.id;

  console.log("CTC & statutory rules");
  const ctc = await call(hr, "POST", "/hr/ctc/preview", { ctcAnnual: 600000 });
  const b = ctc.body;
  ok(ctc.status === 200 && b.monthly.basic === 20000 && b.monthly.hra === 10000, "₹6 L CTC: basic 40 % (₹20,000), HRA 50 % of basic", b?.monthly);
  ok(b.employer.pf === 1800 && b.deductions.pf === 1800, "PF is 12 % of the ₹15,000 wage ceiling (₹1,800)", b?.employer);
  ok(b.employer.gratuity === 962 && b.monthly.special === 50000 - 20000 - 10000 - 1800 - 962, "gratuity 4.81 % of basic; special allowance balances the CTC");
  ok(b.deductions.esi === 0 && b.employer.esi === 0, "no ESI above the ₹21,000 gross ceiling");
  ok(b.deductions.tds === 0 && b.deductions.pt === 200, "no TDS under ₹12 L (rebate); professional tax by slab");
  ok(b.annual.ctc === 600000 || Math.abs(b.annual.ctc - 600000) <= 12, "the annexure adds back up to the CTC", b?.annual);
  const low = (await call(hr, "POST", "/hr/ctc/preview", { ctcAnnual: 180000 })).body;
  ok(low.employer.esi > 0 && low.deductions.esi > 0 && low.grossMonthly <= 21000, "ESI applies to a ₹1.8 L CTC", { gross: low.grossMonthly, esi: low.employer.esi });
  ok(annualIncomeTax(1275000) === Math.round(Math.min(60000 + 0, 1200000 - 1200000 + 0) * 1.04) || annualIncomeTax(1275000) === 0, "₹12.75 L gross (₹12 L taxable) pays no tax");
  ok(annualIncomeTax(1675000) === Math.round((20000 + 40000 + 60000) * 1.04), "₹16.75 L gross: slabs 5/10/15 % on ₹16 L taxable + 4 % cess", annualIncomeTax(1675000));
  ok((await call(teacher, "POST", "/hr/ctc/preview", { ctcAnnual: 600000 })).status === 403, "a teacher cannot use the CTC tool");

  console.log("Recruitment → offer → joining");
  const app = await call(hr, "POST", "/job-applications", { name: `${TAG} Candidate`, email: `${TAG}@example.com`, phone: "9000012345", qualification: "M.Sc. Chemistry, B.Ed.", experienceYears: 4, source: "Referral" });
  ok(app.status === 201, "HR adds a referred candidate", app.body);
  const appId: string = app.body.id;
  created.applicationIds.push(appId);
  ok((await call(hr, "PATCH", `/job-applications/${appId}`, { status: "SHORTLISTED", screeningScore: 78, screeningNotes: "Strong subject knowledge" })).status === 200, "screening score and notes recorded");
  const r1 = await call(hr, "POST", `/job-applications/${appId}/interviews`, { title: "Demo class", mode: "DEMO_CLASS", scheduledAt: `${day(1)}T10:00`, interviewer: "Ms. Priya Sharma" });
  ok(r1.status === 201 && r1.body.roundNo === 1, "round 1 (demo class) scheduled", r1.body);
  ok((await call(hr, "POST", `/job-applications/${appId}/interviews`, { title: "HR", mode: "IN_PERSON", scheduledAt: `${day(2)}T10:00`, interviewer: "HR" })).status === 409, "the next round waits for a result");
  ok((await call(hr, "POST", `/job-applications/${appId}/offer`, { designation: "TGT Chemistry", department: "Science", staffType: "TEACHING", employmentType: "PROBATION", joiningDate: day(10), validTill: day(5), ctcAnnual: 540000 })).status === 409, "no offer before every round is passed");
  ok((await call(hr, "PATCH", `/interviews/${r1.body.id}`, { result: "PASS", rating: 4, feedback: "Engaging class, good board work" })).status === 200, "round 1 passed with feedback");
  const offer = await call(hr, "POST", `/job-applications/${appId}/offer`, { designation: "TGT Chemistry", department: "Science", staffType: "TEACHING", employmentType: "PROBATION", joiningDate: day(0), validTill: day(5), ctcAnnual: 540000 });
  ok(offer.status === 201 && /^OFR\/\d{2}-\d{2}\/\d{4}$/.test(offer.body.letterNo) && offer.body.breakdown.monthly.basic === 18000, "offer drafted with letter number and CTC annexure", offer.body);
  const offerId: string = offer.body.id;
  ok((await call(hr, "PATCH", `/offers/${offerId}`, { status: "ACCEPTED" })).status === 409, "a draft offer must be sent before it can be accepted");
  await call(hr, "PATCH", `/offers/${offerId}`, { status: "SENT" });
  ok((await call(hr, "PATCH", `/offers/${offerId}`, { status: "ACCEPTED" })).body.status === "ACCEPTED", "the candidate accepts");
  const joined = await call(hr, "POST", `/offers/${offerId}/join`, { createLogin: true });
  ok(joined.status === 201 && /^T\d{3}$/.test(joined.body.employeeCode) && joined.body.temporaryPassword, "joining creates the employee with the next code and a sign-in", joined.body);
  const newStaffId: string = joined.body.staffId;
  created.staffIds.push(newStaffId);
  const newLogin = await call(null, "POST", "/auth/login", { organization: "greenwood", username: joined.body.employeeCode, password: joined.body.temporaryPassword });
  ok(newLogin.status === 200 && newLogin.body.user.mustChangePassword, "the new teacher signs in and must change the password", newLogin.body?.user);
  if (newLogin.body?.user?.id) created.userIds.push(newLogin.body.user.id);
  const comp = await call(hr, "GET", `/staff/${newStaffId}/compensation`);
  ok(comp.body?.ctcAnnual === 540000, "payroll enrolment: the salary structure comes from the offer", comp.body?.ctcAnnual);
  ok((await call(hr, "POST", `/offers/${offerId}/join`, {})).status === 409, "a candidate joins only once");

  console.log("Onboarding & verification");
  const onb = ((await call(hr, "GET", "/onboarding")).body as { staffId: string; done: number; total: number; tasks: { id: string; key: string; done: boolean }[] }[]).find((x) => x.staffId === newStaffId);
  ok(!!onb && onb.total >= 14 && onb.tasks.find((t) => t.key === "employee_code")?.done === true && onb.tasks.find((t) => t.key === "login")?.done === true, "the joining checklist starts with code, sign-in and payroll done", onb);
  const docTask = onb!.tasks.find((t) => t.key === "id_proof")!;
  ok((await call(hr, "PATCH", `/onboarding/${docTask.id}`, { done: true, note: "Aadhaar copy" })).status === 200, "HR ticks off a document");
  await call(hr, "PATCH", `/staff/${newStaffId}/bgv`, { status: "CLEAR", note: "Previous employer verified" });
  const after = ((await call(hr, "GET", "/onboarding")).body as typeof onb[]).find((x) => x!.staffId === newStaffId)!;
  ok(after.tasks.find((t) => t.key === "bgv")?.done === true, "a clear background check closes its task");
  ok((await call(teacher, "GET", "/onboarding")).status === 403, "a teacher cannot see onboarding");

  console.log("Attendance, leave balance, claims");
  const yesterday = day(-1);
  const att = await call(hr, "PUT", "/staff-attendance", { date: yesterday, entries: [{ staffId: newStaffId, status: "ABSENT" }, { staffId: priyaId, status: "PRESENT", inTime: "07:55", outTime: "14:30" }] });
  ok(att.status === 200 && att.body.saved === 2, "HR marks the staff register");
  created.attendance.push({ staffId: newStaffId, date: yesterday }, { staffId: priyaId, date: yesterday });
  ok((await call(hr, "PUT", "/staff-attendance", { date: day(1), entries: [{ staffId: priyaId, status: "PRESENT" }] })).status === 400, "no attendance for future dates");
  ok((await call(teacher, "PUT", "/staff-attendance", { date: yesterday, entries: [{ staffId: priyaId, status: "PRESENT" }] })).status === 403, "a teacher cannot mark the staff register");
  const mine = await call(teacher, "GET", `/me/attendance?month=${yesterday.slice(0, 7)}`);
  ok(mine.body.days.some((d: { date: string; status: string }) => d.date === yesterday && d.status === "PRESENT"), "the teacher sees their own attendance");
  const balances = (await call(teacher, "GET", "/leave-balances")).body as { balances: { type: string; entitled: number; balance: number }[] }[];
  ok(balances.length === 1 && balances[0].balances.some((x) => x.type === "EARNED" && x.entitled === 15), "a teacher sees their own leave balance", balances);

  const claim = await call(teacher, "POST", "/expense-claims", { date: day(-3), category: "Travel", description: `${TAG} — science fair travel`, amount: 850, receiptName: "bus-ticket.pdf" });
  ok(claim.status === 201 && /^CLM\//.test(claim.body.claimNo), "a teacher claims a reimbursement", claim.body);
  created.claimIds.push(claim.body.id);
  ok((await call(teacher, "POST", "/expense-claims", { date: day(1), category: "Travel", description: "x", amount: 10 })).status === 400, "future-dated claims are refused");
  ok((await call(teacher, "PATCH", `/expense-claims/${claim.body.id}`, { status: "APPROVED" })).status === 403, "a teacher cannot approve claims");
  ok((await call(principal, "PATCH", `/expense-claims/${claim.body.id}`, { status: "REJECTED" })).status === 400, "rejecting needs a reason");
  ok((await call(principal, "PATCH", `/expense-claims/${claim.body.id}`, { status: "APPROVED" })).status === 200, "the principal approves the claim");

  console.log("Payroll, payslips, compliance");
  created.compensationBackup = await withSystem((tx) => tx.staff.findUniqueOrThrow({ where: { id: priyaId }, select: { id: true, compensation: true, basicSalary: true, allowances: true } }));
  const runsBefore = (await call(hr, "GET", "/payroll")).body as { month: string; status: string }[];
  const existing = runsBefore.find((x) => x.month === month);
  if (existing?.status === "PAID") {
    console.log("  (this month is already paid — payroll checks skipped)");
  } else {
    const run = await call(accountant, "POST", `/payroll/${month}/process`, {});
    ok(run.status === 200 && run.body.payslips > 10, "the accountant processes this month's payroll", run.body);
    if (!existing) created.payrollRunId = run.body.id;
    const runs = (await call(hr, "GET", "/payroll")).body as { month: string; payslips: { id: string; staffId: string }[] }[];
    const slips = runs.find((x) => x.month === month)!.payslips;
    const priyaSlip = slips.find((p) => p.staffId === priyaId)!;
    const detail = await call(teacher, "GET", `/payslips/${priyaSlip.id}`);
    ok(detail.status === 200 && detail.body.breakdown.earnings.reimbursement === 850, "the approved claim is reimbursed with salary", detail.body?.breakdown?.earnings);
    ok(detail.body.breakdown.deductionsDetail.pf > 0 && detail.body.net === detail.body.gross - detail.body.deductions, "the teacher reads their own payslip: PF deducted, net = gross − deductions");
    const other = slips.find((p) => p.staffId !== priyaId)!;
    ok((await call(teacher, "GET", `/payslips/${other.id}`)).status === 404, "…but not a colleague's");
    const newSlip = slips.find((p) => p.staffId === newStaffId);
    if (newSlip) {
      const nd = (await call(hr, "GET", `/payslips/${newSlip.id}`)).body;
      ok(nd.breakdown.lopDays === 1 && nd.breakdown.paidDays === nd.breakdown.daysInMonth - 1, "an unapproved absence is loss of pay", nd.breakdown);
    }
    ok(((await call(teacher, "GET", "/me/payslips")).body as { month: string }[]).some((p) => p.month === month), "My payslips lists this month");
    const comp2 = await call(accountant, "GET", `/payroll/${month}/compliance`);
    ok(comp2.status === 200 && comp2.body.totals.pfTotal === comp2.body.totals.pfEmployee + comp2.body.totals.pfEmployer && comp2.body.employees === slips.length, "compliance report: PF / ESI / PT / TDS totals", comp2.body?.totals);
    ok((await call(teacher, "GET", `/payroll/${month}/compliance`)).status === 403, "a teacher cannot see the compliance report");
    if (!existing) {
      await call(accountant, "POST", `/payroll/${month}/pay`, {});
      const paidClaim = ((await call(teacher, "GET", "/expense-claims")).body as { id: string; status: string; paidMonth: string }[]).find((c) => c.id === claim.body.id);
      ok(paidClaim?.status === "PAID" && paidClaim.paidMonth === month, "paying salaries marks the claim paid", paidClaim);
    }
  }
  const setComp = await call(hr, "PUT", `/staff/${priyaId}/compensation`, { ctcAnnual: 720000 });
  ok(setComp.status === 200 && setComp.body.monthly.basic === 24000, "HR revises a salary structure from a new CTC");

  console.log("Training (L&D)");
  const tr = await call(hr, "POST", "/trainings", {
    title: `${TAG} Child safety`, category: "INDUCTION", trainerName: "Ms. Priya Sharma", trainerStaffId: priyaId, mode: "ONLINE", startDate: day(0), endDate: day(1), durationHours: 3,
    slides: [{ title: "Why it matters", body: "Every adult in school is responsible for children's safety." }, { title: "Reporting", body: "Report concerns to the designated officer the same day." }],
  });
  ok(tr.status === 201 && tr.body.slides.length === 2, "HR creates a training with its presentation", tr.body);
  const trId: string = tr.body.id;
  created.trainingIds.push(trId);
  const renamed = await call(hr, "PATCH", `/trainings/${trId}`, { venue: "Online — school meet link" });
  ok(renamed.status === 200 && renamed.body.slides.length === 2 && renamed.body.passPercent === 60, "a PATCH changes only what it sends (slides and pass mark untouched)", renamed.body);
  const qs =await call(hr, "PUT", `/trainings/${trId}/questions`, { questions: [
    { question: "Who must report a safety concern?", options: ["Only the principal", "Every adult in school"], answerIndex: 1 },
    { question: "When should a concern be reported?", options: ["The same day", "At the end of term"], answerIndex: 0 },
  ] });
  ok(qs.status === 200 && qs.body.questions === 2, "question bank saved");
  ok((await call(hr, "PUT", `/trainings/${trId}/questions`, { questions: [{ question: "x?", options: ["a", "b"], answerIndex: 5 }] })).status === 400, "the correct answer must be one of the options");
  ok((await call(hr, "POST", `/trainings/${trId}/enroll`, { staffIds: [newStaffId, priyaId] })).body.added === 1, "participants enrolled (the trainer is not enrolled as a participant)");
  const newTeacher = await login(joined.body.employeeCode, joined.body.temporaryPassword).catch(() => null);
  if (newTeacher) {
    // the new teacher must change the password before using the API
    await call(newTeacher, "POST", "/auth/change-password", { currentPassword: joined.body.temporaryPassword, newPassword: "Newjoin@123" });
    const nt = await login(joined.body.employeeCode, "Newjoin@123");
    const det = await call(nt, "GET", `/trainings/${trId}`);
    ok(det.status === 200 && det.body.questions.every((q: Record<string, unknown>) => !("answerIndex" in q)), "a participant sees the questions without the answers");
    const pre = await call(nt, "POST", `/trainings/${trId}/test`, { kind: "PRE", answers: [0, 1] });
    ok(pre.body.score === 0 && pre.body.passed === false, "pre-test scored by the server (0 %)", pre.body);
    ok((await call(nt, "POST", `/trainings/${trId}/test`, { kind: "PRE", answers: [1, 0] })).status === 409, "the pre-test is taken once");
    const post = await call(nt, "POST", `/trainings/${trId}/test`, { kind: "POST", answers: [1, 0] });
    ok(post.body.score === 100 && post.body.passed && Array.isArray(post.body.answers), "post-test 100 % — the correct answers are shown afterwards", post.body);
    ok((await call(nt, "POST", `/trainings/${trId}/feedback`, { rating: 5, feedback: "Very useful" })).status === 200, "the participant rates the training");
    const ind = ((await call(hr, "GET", "/onboarding")).body as { staffId: string; tasks: { key: string; done: boolean }[] }[]).find((x) => x.staffId === newStaffId)!;
    ok(ind.tasks.find((t) => t.key === "induction")?.done === true, "passing an induction training completes the onboarding task");
    ok((await call(teacher, "GET", `/trainings/${trId}`)).body.participants.length === 1, "the trainer sees the participants");
  }
  const mis = await call(hr, "GET", "/trainings-mis");
  const row = (mis.body.perTraining as { id: string; avgPre: number; avgPost: number; improvement: number; passed: number }[]).find((x) => x.id === trId);
  ok(!!row && row.avgPre === 0 && row.avgPost === 100 && row.improvement === 100 && row.passed === 1, "MIS: pre / post averages, improvement and passes", row);

  console.log("Exit & full and final");
  const sep = await call(teacher, "POST", "/separations", { reason: `${TAG} relocating`, letter: "Dear Sir/Madam, I resign from my post…" });
  ok(sep.status === 201 && sep.body.status === "REQUESTED", "a teacher resigns with a letter");
  const sepId: string = sep.body.id;
  ok((await call(teacher, "PATCH", `/separations/${sepId}`, { action: "ACCEPT" })).status === 403, "a teacher cannot accept their own resignation");
  ok((await call(teacher, "PATCH", `/separations/${sepId}`, { action: "WITHDRAW" })).body.status === "WITHDRAWN", "…but can withdraw it");
  await withSystem((tx) => tx.separation.delete({ where: { id: sepId } }));
  // the new joinee leaves (HR records it with today as the last day)
  const sep2 = await call(hr, "POST", "/separations", { staffId: newStaffId, type: "TERMINATION", reason: `${TAG} probation not confirmed`, lastWorkingDay: day(0) });
  ok(sep2.status === 201 && sep2.body.status === "ACCEPTED" && sep2.body.handover.length > 0, "HR records a separation with a handover checklist", sep2.body);
  const sep2Id: string = sep2.body.id;
  ok((await call(hr, "PUT", `/separations/${sep2Id}/exit-interview`, { primaryReason: "Probation", workEnvironment: 4, management: 4, growth: 3, compensation: 3, wouldRecommend: true, wouldRejoin: false, suggestions: "More mentoring" })).status === 200, "exit interview recorded");
  ok((await call(hr, "POST", `/separations/${sep2Id}/settle`, {})).status === 409, "settlement needs the full & final first");
  const fnf = await call(hr, "POST", `/separations/${sep2Id}/fnf`, { otherDeductions: 500 });
  ok(fnf.status === 200 && fnf.body.net === fnf.body.totalEarnings - fnf.body.totalDeductions && fnf.body.earnings.length >= 4, "full & final computed (salary, encashment, bonus, gratuity, claims, recoveries)", fnf.body);
  ok((await call(hr, "POST", `/separations/${sep2Id}/settle`, {})).status === 409, "settlement needs the handover done");
  await call(hr, "PUT", `/separations/${sep2Id}/handover`, { items: sep2.body.handover.map((h: { item: string }) => ({ item: h.item, owner: "HR", done: true })) });
  const docsBefore = (await call(hr, "GET", `/separations/${sep2Id}/documents`)).body;
  ok(docsBefore.available.experienceCertificate === false, "no experience certificate before settlement");
  const settled = await call(hr, "POST", `/separations/${sep2Id}/settle`, {});
  ok(settled.status === 200 && settled.body.status === "SETTLED" && settled.body.sentToAccounts === (fnf.body.net > 0), "settled — the payable goes to Accounts", settled.body);
  const exp = await withSystem((tx) => tx.separation.findUnique({ where: { id: sep2Id }, select: { expenseId: true } }));
  if (exp?.expenseId) created.expenseIds.push(exp.expenseId);
  const expenses = (await call(accountant, "GET", "/expenses")).body as { category: string; description: string }[];
  ok(fnf.body.net <= 0 || expenses.some((e) => e.category === "Full & Final Settlement" && e.description.includes(joined.body.employeeCode)), "Accounts sees the F&F payable");
  const leaver = await call(null, "POST", "/auth/login", { organization: "greenwood", username: joined.body.employeeCode, password: "Newjoin@123" });
  ok(leaver.status === 401 || leaver.status === 403, "the leaver can no longer sign in", leaver);
  const docs = (await call(hr, "GET", `/separations/${sep2Id}/documents`)).body;
  ok(docs.available.experienceCertificate && docs.available.relievingLetter && docs.employee.employeeCode === joined.body.employeeCode, "experience certificate and relieving letter are available", docs.available);

  console.log("Inventory");
  const v = await call(store, "POST", "/procurement/vendors", { name: `${TAG} Vendor`, tdsSection: "194C" });
  ok(v.status === 201 && /^V-\d{4}$/.test(v.body.code), "a new vendor gets the next vendor code", v.body?.code);
  if (v.body?.id) created.vendorIds.push(v.body.id);
  const an = await call(store, "GET", "/inventory/analysis");
  ok(an.status === 200 && an.body.items.length > 0 && an.body.abc.A + an.body.abc.B + an.body.abc.C === an.body.items.length, "stock analysis with ABC classes", an.body?.abc);
  ok(an.body.movement.FAST + an.body.movement.SLOW + an.body.movement.NON_MOVING === an.body.items.length && an.body.consumption.length === 6, "movement classes and six months of consumption");
  ok((await call(teacher, "GET", "/inventory/analysis")).status === 403, "a teacher cannot see stock analysis");
}

async function cleanup() {
  await withSystem(async (tx) => {
    const offers = await tx.jobOffer.findMany({ where: { applicationId: { in: created.applicationIds } }, select: { id: true } });
    await tx.interviewRound.deleteMany({ where: { applicationId: { in: created.applicationIds } } });
    await tx.jobOffer.deleteMany({ where: { id: { in: offers.map((o) => o.id) } } });
    await tx.jobApplication.deleteMany({ where: { id: { in: created.applicationIds } } });
    await tx.trainingEnrollment.deleteMany({ where: { trainingId: { in: created.trainingIds } } });
    await tx.trainingQuestion.deleteMany({ where: { trainingId: { in: created.trainingIds } } });
    await tx.training.deleteMany({ where: { id: { in: created.trainingIds } } });
    await tx.separation.deleteMany({ where: { OR: [{ staffId: { in: created.staffIds } }, { reason: { startsWith: TAG } }] } });
    await tx.expense.deleteMany({ where: { id: { in: created.expenseIds } } });
    for (const a of created.attendance) await tx.staffAttendance.deleteMany({ where: { staffId: a.staffId, date: new Date(`${a.date}T00:00:00Z`) } });
    await tx.expenseClaim.deleteMany({ where: { id: { in: created.claimIds } } });
    if (created.payrollRunId) {
      await tx.payslip.deleteMany({ where: { payrollRunId: created.payrollRunId } });
      await tx.payrollRun.delete({ where: { id: created.payrollRunId } });
    }
    await tx.payslip.deleteMany({ where: { staffId: { in: created.staffIds } } });
    if (created.compensationBackup) {
      const c = created.compensationBackup;
      await tx.staff.update({ where: { id: c.id }, data: { compensation: c.compensation, basicSalary: c.basicSalary as number, allowances: c.allowances } });
    }
    await tx.onboardingTask.deleteMany({ where: { staffId: { in: created.staffIds } } });
    const users = await tx.staff.findMany({ where: { id: { in: created.staffIds } }, select: { userId: true } });
    await tx.staff.deleteMany({ where: { id: { in: created.staffIds } } });
    const userIds = [...new Set([...created.userIds, ...users.map((u) => u.userId).filter((x): x is string => !!x)])];
    await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await tx.membership.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: created.vendorIds } } });
  });
}

main()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
