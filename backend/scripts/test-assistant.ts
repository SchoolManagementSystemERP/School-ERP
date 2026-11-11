/**
 * Jarvis (voice assistant) checks against the "greenwood" demo organization:
 *   npm run test:assistant
 * Data questions are answered without the AI model, so Ollama does not need to be running.
 * Checks: answers come from the database, each role sees only what it may, memory works and can be
 * cleared, and other users never see someone's memory. The test users' memory is cleared at the end.
 */
import "./assistant-test-env.js";
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";
import { classIn, detectIntent, nameIn } from "../src/modules/assistant/intent.js";

const ORG = "greenwood";
let pass = 0;
let fail = 0;
const ok = (condition: boolean, label: string, extra?: unknown) => {
  condition ? pass++ : fail++;
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}${!condition && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string) {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ organization: ORG, username, password: "Demo@1234" }),
  });
  const body = await response.json();
  if (response.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(body)}`);
  return body.accessToken as string;
}
const ask = (token: string, content: string) =>
  call(token, "POST", "/assistant/chat", { messages: [{ role: "user", content }], pagePath: "/", links: [] });

const tokens: string[] = [];
const TAG = `JT${Date.now().toString(36)}`;
const created = { leaves: [] as string[], notices: [] as string[], payments: [] as string[] };

/** Removes what the action checks created (audit log rows stay — they are immutable). */
async function cleanup() {
  await withSystem(async (tx) => {
    const journals = await tx.journalEntry.findMany({ where: { sourceType: "FEE_PAYMENT", sourceId: { in: created.payments } }, select: { id: true } });
    await tx.journalLine.deleteMany({ where: { journalEntryId: { in: journals.map((j) => j.id) } } });
    await tx.journalEntry.deleteMany({ where: { id: { in: journals.map((j) => j.id) } } });
    await tx.feePayment.deleteMany({ where: { id: { in: created.payments } } });
    await tx.announcementAudience.deleteMany({ where: { OR: [{ announcementId: { in: created.notices } }, { announcement: { body: { contains: TAG } } }] } });
    await tx.announcement.deleteMany({ where: { OR: [{ id: { in: created.notices } }, { body: { contains: TAG } }] } });
    await tx.leaveRequest.deleteMany({ where: { OR: [{ id: { in: created.leaves } }, { reason: { startsWith: TAG } }] } });
    // what the test users told Jarvis to remember
    const org = await tx.organization.findUnique({ where: { subdomain: ORG }, select: { id: true } });
    const users = org ? await tx.user.findMany({ where: { organizationId: org.id, username: { in: ["principal", "T001", "9876511111", "accountant"] } }, select: { id: true } }) : [];
    await tx.assistantNote.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  });
}

async function main() {
  console.log("Understanding questions (no AI model)");
  const all = ["school_summary", "find_student", "student_fees", "student_attendance", "student_marks", "class_attendance", "fee_defaulters", "find_staff", "staff_leaves", "low_stock", "library_overdue"];
  const cases: [string, string][] = [
    ["Aakash Tiwari ki fees kitni baaki hai?", "student_fees"],
    ["Sabse zyada fees kiski baaki hai?", "fee_defaulters"],
    ["Class 10 B mein kiski fees baaki hai?", "fee_defaulters"],
    ["Aakash ke marks kitne aaye?", "student_marks"],
    ["Class 10 A mein aaj kaun absent hai?", "class_attendance"],
    ["Aakash ki attendance kaisi hai?", "student_attendance"],
    ["Aakash ke papa ka phone number kya hai?", "find_student"],
    ["Priya Sharma madam ki details batao", "find_staff"],
    ["Aaj kaun kaun staff chhutti pe hai?", "staff_leaves"],
    ["School mein total kitne students aur staff hain?", "school_summary"],
    ["Store mein kaunsa saman kam hai?", "low_stock"],
    ["Library ki kaunsi books late hain?", "library_overdue"],
  ];
  for (const [question, tool] of cases) {
    const intent = detectIntent(question, all);
    ok(intent?.tool === tool, `“${question}” → ${tool}`, intent);
  }
  for (const question of ["marks page kholo", "fees page dikhao", "attendance kholo", "Is page par kya hai?"]) {
    ok(detectIntent(question, all) === null, `“${question}” is left to page navigation / the model`, detectIntent(question, all));
  }
  ok(nameIn("Aakash Tiwari ki fees kitni baaki hai?") === "aakash tiwari", "student name is picked out of the question", nameIn("Aakash Tiwari ki fees kitni baaki hai?"));
  ok(nameIn("aur uski attendance?") === "", "pronouns are not taken as names");
  ok(classIn("class 10-b mein kaun absent") === "10 B", "class is picked out of the question");

  const principal = await login("principal");
  const teacher = await login("T001");
  const parent = await login("9876511111");
  const accountant = await login("accountant");
  tokens.push(principal, teacher, parent, accountant);
  for (const token of tokens) await call(token, "DELETE", "/assistant/history");

  console.log("Answers from the database");
  const fees = await ask(principal, "Aakash Tiwari ki fees kitni baaki hai?");
  ok(fees.status === 200 && fees.body.source === "student_fees" && /Aakash Tiwari/.test(fees.body.reply) && /₹/.test(fees.body.reply), "principal gets a student's fees", fees.body);
  const summary = await ask(principal, "School mein total kitne students aur staff hain?");
  ok(summary.status === 200 && summary.body.source === "school_summary" && /active students/.test(summary.body.reply), "principal gets the school summary", summary.body);
  const defaulters = await ask(accountant, "Class 12 B mein kiski fees baaki hai?");
  ok(defaulters.status === 200 && defaulters.body.source === "fee_defaulters" && /Class 12 B/.test(defaulters.body.reply), "accountant gets a class's fee defaulters", defaulters.body);

  console.log("Each role sees only what it may");
  const teacherFees = await ask(teacher, "Aakash Tiwari ki fees kitni baaki hai?");
  ok(teacherFees.status === 200 && /available nahi/.test(teacherFees.body.reply), "a teacher cannot read fees", teacherFees.body);
  const ownChild = await ask(parent, "Mere bachche ki fees kitni baaki hai?");
  ok(ownChild.status === 200 && ownChild.body.source === "student_fees" && /₹/.test(ownChild.body.reply), "a parent gets their own child's fees", ownChild.body);
  const otherChild = await ask(parent, "Aakash Tiwari ki fees batao");
  ok(otherChild.status === 200 && /nahi mila/.test(otherChild.body.reply) && !/₹/.test(otherChild.body.reply), "a parent cannot read another child's fees", otherChild.body);
  const parentDefaulters = await ask(parent, "Sabse zyada fees kiski baaki hai?");
  ok(parentDefaulters.status === 200 && /available nahi/.test(parentDefaulters.body.reply), "a parent cannot list fee defaulters", parentDefaulters.body);

  console.log("Conversation: asking back and finishing the question");
  await call(principal, "DELETE", "/assistant/history");
  const askClass = await ask(principal, "Jarvis mujhe students ki attendance dekhni hai");
  ok(askClass.body.expectsReply === true && /Kaunsi class/.test(askClass.body.reply), "Jarvis asks which class when none is given", askClass.body);
  const classAnswer = await ask(principal, "class 10 A ki dikhao");
  ok(classAnswer.body.source === "class_attendance" && /10 A/.test(classAnswer.body.reply), "the answer “class 10 A ki dikhao” finishes the attendance question", classAnswer.body);
  const nextClass = await ask(principal, "aur 10 B ki?");
  ok(nextClass.body.source === "class_attendance" && /10 B/.test(nextClass.body.reply), "“aur 10 B ki?” keeps the topic", nextClass.body);
  const askStudent = await ask(principal, "Mujhe fees dekhni hai");
  ok(askStudent.body.expectsReply === true && /Kis student/.test(askStudent.body.reply), "Jarvis asks whose fees", askStudent.body);
  const nameAnswer = await ask(principal, "Aakash Tiwari ki");
  ok(nameAnswer.body.source === "student_fees" && /Aakash Tiwari/.test(nameAnswer.body.reply), "the answer “Aakash Tiwari ki” gives his fees (not attendance)", nameAnswer.body);
  const otherName = await ask(principal, "aur Riya Sharma ki?");
  ok(otherName.body.source === "student_fees" && /Riya Sharma/.test(otherName.body.reply), "“aur Riya Sharma ki?” keeps the fees topic", otherName.body);
  await ask(principal, "fees dikhao");
  const byClass = await ask(principal, "12 B");
  ok(byClass.body.source === "fee_defaulters" && /12 B/.test(byClass.body.reply), "answering a class to “whose fees?” lists that class's dues", byClass.body);
  await ask(principal, "attendance dekhni hai");
  const unclear = await ask(principal, "pata nahi");
  ok(unclear.body.expectsReply === true && /Samajh nahi aaya/.test(unclear.body.reply), "an unclear answer gets the question again", unclear.body);
  const cancelled = await ask(principal, "chhodo");
  ok(/chhod diya/.test(cancelled.body.reply) && !cancelled.body.expectsReply, "“chhodo” cancels the open question", cancelled.body);
  const parentAsk = await ask(parent, "fees dekhni hai");
  ok(parentAsk.body.source === "student_fees" && !parentAsk.body.expectsReply, "a parent is not asked “which student?” — it is their child", parentAsk.body);
  for (const token of [principal, parent]) await call(token, "DELETE", "/assistant/history");
  await ask(principal, "Aakash Tiwari ki fees kitni baaki hai?");

  console.log("Everyday information");
  const timetable = await ask(principal, "Class 10 A ka aaj ka timetable batao");
  ok(timetable.body.source === "timetable" && /10 A/.test(timetable.body.reply), "a class's timetable for today", timetable.body);
  const myTimetable = await ask(teacher, "mera timetable kya hai?");
  ok(myTimetable.body.source === "timetable" && /Aapka/.test(myTimetable.body.reply), "a teacher's own timetable", myTimetable.body);
  const exams = await ask(parent, "exam kab hai?");
  ok(exams.body.source === "exam_schedule" && /Aane wale exams|koi aane wala exam nahi/.test(exams.body.reply), "a parent gets the date sheet for their child's class", exams.body);
  const bus = await ask(parent, "bus ka time kya hai?");
  ok(bus.body.source === "transport" && /pickup|transport nahi/.test(bus.body.reply), "a parent gets their child's bus", bus.body);
  const otherClass = await ask(parent, "10 B ka timetable");
  ok(/nahi mili/.test(otherClass.body.reply), "a parent cannot read another class's timetable", otherClass.body);
  const holidays = await ask(principal, "Agli chhutti kab hai?");
  ok(holidays.body.source === "holidays", "upcoming holidays", holidays.body);
  const feeNotice = await ask(principal, "Fees wala notice dikhao");
  ok(feeNotice.body.source === "notices" && /fees/i.test(feeNotice.body.reply), "notices are searched by topic (“fees wala notice”)", feeNotice.body);
  const slip = await ask(teacher, "meri salary slip");
  ok(slip.body.source === "my_payslip" && /salary|slip/.test(slip.body.reply), "a staff member gets their own salary slip", slip.body);
  const info = await ask(parent, "School ka phone number kya hai?");
  ok(info.body.source === "school_info" && /phone/.test(info.body.reply), "school contact details", info.body);
  const briefOffice = await ask(principal, "Good morning Jarvis");
  ok(briefOffice.body.source === "daily_briefing" && /Good morning/.test(briefOffice.body.reply) && /Fees overdue/.test(briefOffice.body.reply), "principal's morning briefing", briefOffice.body);
  const briefTeacher = await ask(teacher, "good morning");
  ok(briefTeacher.body.source === "daily_briefing" && /period/.test(briefTeacher.body.reply), "teacher's morning briefing has their periods", briefTeacher.body);
  const briefParent = await ask(parent, "good morning");
  ok(briefParent.body.source === "daily_briefing" && !/Fees overdue: ₹/.test(briefParent.body.reply), "parent's briefing is about their own child only", briefParent.body);

  console.log("Remembering and picking");
  for (const token of [principal, teacher]) await call(token, "DELETE", "/assistant/history");
  await ask(principal, "bhool jao");
  const remembered = await ask(principal, "yaad rakho meri class 10 B hai");
  ok(/10 B/.test(remembered.body.reply), "“yaad rakho meri class 10 B hai” is saved", remembered.body);
  const myClassAtt = await ask(principal, "meri class ki attendance dikhao");
  ok(myClassAtt.body.source === "class_attendance" && /10 B/.test(myClassAtt.body.reply), "“meri class” means the remembered class", myClassAtt.body);
  const recall = await ask(principal, "kya yaad hai?");
  ok(/10 B/.test(recall.body.reply), "“kya yaad hai?” lists it", recall.body);
  await ask(principal, "bhool jao");
  const recallAfter = await ask(principal, "kya yaad hai?");
  ok(/kuch yaad nahi/.test(recallAfter.body.reply), "“bhool jao” forgets it", recallAfter.body);
  const teacherClass = await ask(teacher, "bacchon ki attendance dikhao");
  ok(teacherClass.body.source === "class_attendance", "a class teacher's “bacchon ki attendance” is their own class", teacherClass.body);
  const several = await ask(principal, "Sharma ki fees batao");
  ok(/kai students/.test(several.body.reply), "several matches are listed", several.body);
  const picked = await ask(principal, "10 B wali");
  ok(picked.body.source === "student_fees" && /Riya Sharma/.test(picked.body.reply), "“10 B wali” picks one of them", picked.body);
  const riya = await ask(principal, "Riya ki fees kitni baaki hai?");
  ok(/Riya Sharma/.test(riya.body.reply) && !/Priya|Shriya/.test(riya.body.reply), "names match from the start (Riya, not Priya / Shriya)", riya.body);

  console.log("Actions: prepared by Jarvis, run by the normal endpoint after confirming");
  // a leave request of our own, approved through Jarvis
  const leave = await call(teacher, "POST", "/leaves", { type: "CASUAL", fromDate: "2027-03-15", toDate: "2027-03-15", reason: `${TAG} Jarvis test` });
  if (leave.body?.id) created.leaves.push(leave.body.id);
  const proposal = await ask(principal, "Rajesh Kumar ki leave approve karo");
  ok(proposal.body.action?.method === "PATCH" && proposal.body.action.path === `/leaves/${leave.body?.id}` && !proposal.body.expectsReply, "Jarvis prepares the leave approval (nothing changes yet)", proposal.body);
  const stillPending = await call(principal, "GET", "/leaves");
  ok(JSON.stringify(stillPending.body).includes(leave.body?.id) && (stillPending.body as { id: string; status: string }[]).find((l) => l.id === leave.body?.id)?.status === "PENDING", "the leave is still pending before confirming");
  const approved = await call(principal, proposal.body.action.method, proposal.body.action.path, proposal.body.action.body);
  ok(approved.status === 200 && approved.body.status === "APPROVED", "confirming approves it through PATCH /leaves", approved.body);
  const teacherCannot = await ask(teacher, "Priya Sharma ki leave approve karo");
  ok(/available nahi/.test(teacherCannot.body.reply) && !teacherCannot.body.action, "a teacher cannot approve leaves", teacherCannot.body);

  const noticeProposal = await ask(principal, `Class 10 A ke parents ko notice bhejo ki ${TAG} kal school 10 baje khulega`);
  ok(noticeProposal.body.action?.path === "/announcements" && noticeProposal.body.action.body.audience?.[0]?.type === "SECTION", "Jarvis prepares a class notice", noticeProposal.body);
  const posted = await call(principal, "POST", noticeProposal.body.action.path, noticeProposal.body.action.body);
  if (posted.body?.id) created.notices.push(posted.body.id);
  ok(posted.status === 201, "confirming posts it through POST /announcements", posted.body);

  const feeProposal = await ask(accountant, "Aakash Tiwari ki fees UPI se jama karo");
  ok(feeProposal.body.action?.path === "/fees/payments" && feeProposal.body.action.body.method === "UPI", "Jarvis prepares a counter fee payment", feeProposal.body);
  const paid = await call(accountant, "POST", feeProposal.body.action.path, feeProposal.body.action.body);
  if (paid.body?.id) created.payments.push(paid.body.id);
  ok(paid.status === 201 && paid.body.receiptNo, "confirming records it through POST /fees/payments", paid.body);
  const parentCannot = await ask(parent, "Mere bachche ki fees cash mein jama karo");
  ok(!parentCannot.body.action, "a parent cannot record counter payments", parentCannot.body);

  console.log("Natural conversation");
  await call(principal, "DELETE", "/assistant/history");
  for (const [said, expected] of [["Hello Jarvis", /Namaste/], ["kaise ho?", /theek hoon/], ["tum kaun ho?", /Jarvis/], ["tum kya kya kar sakte ho?", /kar sakta hoon/], ["thank you", /swagat/], ["ok bye", /milte hain/]] as const) {
    const started = Date.now();
    const reply = await ask(principal, said);
    ok(expected.test(reply.body.reply) && Date.now() - started < 3_000, `“${said}” gets a quick friendly reply (no AI model)`, reply.body);
  }
  const notNames = await ask(principal, "kaunse bacche fail hain?");
  ok(notNames.body.source === "failing_students" && !/naam ka koi student/.test(notNames.body.reply), "question words are never taken for a name (“kaunse bacche fail hain”)", notNames.body);
  const hearingSlip = await ask(principal, "Akash ki fees");
  ok(/Aakash Tiwari/.test(hearingSlip.body.reply), "a hearing slip still finds the name (“Akash” → Aakash)", hearingSlip.body);
  const both = await ask(principal, "uski fees aur attendance dono batao");
  ok(/fees/.test(both.body.reply) && /attendance/.test(both.body.reply), "“fees aur attendance dono” answers both", both.body);
  const paidOrNot = await ask(principal, "usne fees di ya nahi?");
  ok(paidOrNot.body.source === "student_fees" && /Aakash Tiwari/.test(paidOrNot.body.reply), "“usne fees di ya nahi?” is about the same student", paidOrNot.body);
  const about = await ask(principal, "Riya Sharma ke baare mein batao");
  ok(/Riya Sharma/.test(about.body.reply) && /fees/.test(about.body.reply) && /Exam|exam/.test(about.body.reply), "“… ke baare mein batao” gives an overview", about.body);
  const number = await ask(principal, "Riya Sharma ka number do");
  ok(number.body.source === "find_student", "“… ka number do” is the contact, not marks", number.body);
  const strength = await ask(principal, "class 10 m kitne bache hai");
  ok(strength.body.source === "class_strength" && /Class 10 mein kul \d+ bachche/.test(strength.body.reply), "“class 10 m kitne bache hai” counts the class", strength.body);
  const sectionStrength = await ask(principal, "10 A ki strength kya hai");
  ok(sectionStrength.body.source === "class_strength" && /10 A mein \d+ bachche/.test(sectionStrength.body.reply), "one section's strength", sectionStrength.body);
  const ranking = await ask(principal, "sabse kam attendance kis class ki hai?");
  ok(ranking.body.source === "attendance_ranking", "class attendance ranking", ranking.body);
  const tomorrow = await ask(principal, "kal kaunsa exam hai?");
  ok(tomorrow.body.source === "exam_schedule" && /ko (koi exam nahi|exam:)/.test(tomorrow.body.reply), "“kal kaunsa exam hai” is about that one day", tomorrow.body);
  const otherKid = await ask(parent, "Aakash Tiwari ki fees batao");
  ok(!/Alice|₹/.test(otherKid.body.reply), "a parent asking about another child is not answered with their own child", otherKid.body);

  console.log("ERP-wide reading (through the API, as the signed-in person)");
  await call(principal, "DELETE", "/assistant/history");
  const enquiries = await ask(principal, "admission enquiries dikhao");
  ok(enquiries.body.source === "erp:/enquiries" && /Admission enquiries: kul \d+/.test(enquiries.body.reply), "principal reads admission enquiries", enquiries.body);
  const visitors = await ask(principal, "aaj kitne visitors aaye");
  ok(visitors.body.source === "erp:/visitors" && /Visitors \(aaj\)/.test(visitors.body.reply), "“aaj kitne visitors aaye” reads today's visitors (not attendance)", visitors.body);
  const pendingPrs = await ask(principal, "pending purchase requests kitni hain");
  ok(pendingPrs.body.source === "erp:/procurement/indents" && /pending/.test(pendingPrs.body.reply), "status words filter a list (pending purchase requests)", pendingPrs.body);
  const hostel = await ask(principal, "hostel ka haal");
  ok(hostel.body.source === "erp:/hostel" && !/\brecord\b/.test(hostel.body.reply), "rows with only a student id show the student's name", hostel.body);
  const report = await ask(principal, "balance sheet dikhao");
  ok(report.body.source === "erp:/accounts/ledger/reports" && !/nahi mil paya/.test(report.body.reply), "reports that need a period get this financial year", report.body);
  const parentVendors = await ask(parent, "vendors ki list");
  ok(/available nahi/.test(parentVendors.body.reply) && !/Gupta|Lab Mart/.test(parentVendors.body.reply), "a parent cannot read vendors through Jarvis", parentVendors.body);
  const teacherPayroll = await ask(teacher, "payroll dikhao");
  ok(/available nahi/.test(teacherPayroll.body.reply), "a teacher cannot read payroll through Jarvis", teacherPayroll.body);
  const parentStaff = await ask(parent, "staff list dikhao");
  // parents get the school's staff directory (names, designations — by design, as on the pages), never phone or salary
  ok(!/\+91|\d{5}-\d{5}|₹/.test(parentStaff.body.reply), "a parent sees only the staff directory — no phone numbers or salaries", parentStaff.body);
  const addStudent = await call(principal, "POST", "/assistant/chat", { messages: [{ role: "user", content: "naya student add karo" }], pagePath: "/principal", links: [{ href: "/principal/students", label: "Students" }] });
  ok(addStudent.body.navigation?.href === "/principal/students" && !addStudent.body.action, "a change without a confirm step only offers the page", addStudent.body);
  const issueBook = await ask(principal, "book issue kar do");
  ok(!issueBook.body.source && !issueBook.body.action, "“book issue kar do” is never answered by reading a list", issueBook.body);

  console.log("Memory");
  for (const token of [principal, accountant]) await call(token, "DELETE", "/assistant/history");
  await ask(principal, "Aakash Tiwari ki fees kitni baaki hai?");
  const followUp = await ask(principal, "aur uske marks?");
  ok(followUp.status === 200 && followUp.body.source === "student_marks" && /Aakash Tiwari/.test(followUp.body.reply), "a follow-up uses the saved conversation (even after a refresh)", followUp.body);
  const history = await call(principal, "GET", "/assistant/history");
  ok(history.status === 200 && history.body.total === 4 && typeof history.body.memoryMinutes === "number", "the conversation is saved", history.body?.total);
  const others = await call(accountant, "GET", "/assistant/history");
  ok(others.status === 200 && others.body.messages.every((m: { content: string }) => !/Aakash Tiwari ki fees/.test(m.content)), "another user never sees it");
  const cleared = await call(principal, "DELETE", "/assistant/history");
  const after = await call(principal, "GET", "/assistant/history");
  ok(cleared.status === 200 && after.body.total === 0, "memory can be cleared");
}

main()
  .catch((error) => {
    fail++;
    console.error(error);
  })
  .finally(async () => {
    for (const token of tokens) await call(token, "DELETE", "/assistant/history").catch(() => undefined);
    await cleanup().catch((error) => { fail++; console.error("cleanup failed:", error); });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
