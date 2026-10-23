/**
 * Academics API end-to-end, against the "greenwood" demo organization (npm run import:frontend):
 *   npm run test:academics
 * Timetable, attendance, exams & marks, assignments and notes over HTTP as each role, with the
 * permission and validation guards; everything it creates is removed at the end.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

const ORG = "greenwood";
const PASSWORD = "Demo@1234";
let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ✓" : "  ✗"} ${label}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string) {
  const r = await call(null, "POST", "/auth/login", { organization: ORG, username, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const TAG = `acad-test-${Date.now()}`;
const created = { sessions: [] as string[], exams: [] as string[], assignments: [] as string[], notes: [] as string[] };
let restoreTimetable: (() => Promise<unknown>) | null = null;

async function main() {
  const teacher = await login("T002");
  const principal = await login("principal");
  const exams = await login("exams");
  const student = await login("ADM-2025-1001");
  const parent = await login("9876511111");

  const me = await call(student, "GET", "/me");
  const aliceId: string = me.body.students[0].id;
  const alice = (await call(student, "GET", `/students/${aliceId}`)).body;
  const sectionId: string = alice.class.sectionId;
  const roster = (await call(principal, "GET", "/students/full")).body as { id: string; class: { sectionId: string } | null }[];
  const classmates = roster.filter((s) => s.class?.sectionId === sectionId).map((s) => s.id);
  const outsider = roster.find((s) => s.class && s.class.sectionId !== sectionId)!.id;
  const subjects = (await call(teacher, "GET", "/subjects")).body as { id: string; name: string }[];
  const subject = (n: string) => subjects.find((s) => s.name === n)!.id;

  console.log("Subjects & timetable");
  ok(subjects.length > 5, "subjects are listed");
  ok((await call(teacher, "POST", "/subjects", { code: "TST", name: "Test" })).status === 403, "a teacher cannot add subjects");
  const all = (await call(principal, "GET", "/timetable")).body as { sectionId: string; dayOfWeek: number; periodNo: number; startTime: string; endTime: string; subjectId: string; teacherId: string | null }[];
  const mine = (await call(student, "GET", "/timetable")).body as typeof all;
  ok(all.length > mine.length && mine.length > 0 && mine.every((p) => p.sectionId === sectionId), "a student sees only their own section's timetable", { all: all.length, mine: mine.length });
  ok((await call(teacher, "PUT", `/timetable/sections/${sectionId}`, { periods: [] })).status === 403, "a teacher cannot change the timetable");
  const original = all.filter((p) => p.sectionId === sectionId).map(({ dayOfWeek, periodNo, startTime, endTime, subjectId, teacherId }) => ({ dayOfWeek, periodNo, startTime, endTime, subjectId, teacherId }));
  restoreTimetable = () => call(principal, "PUT", `/timetable/sections/${sectionId}`, { periods: original });
  const same = await restoreTimetable() as { status: number; body: { periods: number } };
  ok(same.status === 200 && same.body.periods === original.length, "the principal saves a section's timetable (clashes already on file do not block it)", same);
  const busy = all.find((p) => p.sectionId !== sectionId && p.teacherId && !original.some((o) => o.dayOfWeek === p.dayOfWeek && o.periodNo === p.periodNo && o.teacherId === p.teacherId))!;
  const clash = await call(principal, "PUT", `/timetable/sections/${sectionId}`, { periods: [{ ...busy, sectionId: undefined }] });
  ok(clash.status === 400 && /already teaches/.test(clash.body.message), "a teacher cannot be in two classes in the same period", clash.body);
  const afterClash = (await call(principal, "GET", `/timetable?sectionId=${sectionId}`)).body as unknown[];
  ok(afterClash.length === original.length, "a refused timetable change leaves the timetable as it was");

  console.log("Attendance");
  const today = new Date().toISOString().slice(0, 10);
  const register = { sectionId, date: today, periodNo: 12, subjectId: subject("Science"), entries: classmates.map((id) => ({ studentId: id, status: id === aliceId ? "ABSENT" : "PRESENT" })) };
  const saved = await call(teacher, "PUT", "/attendance", register);
  ok(saved.status === 200 && saved.body.entries.length === classmates.length, "a teacher saves a register", saved.body);
  if (saved.body?.id) created.sessions.push(saved.body.id);
  const again = await call(teacher, "PUT", "/attendance", { ...register, entries: register.entries.map((e) => ({ ...e, status: "PRESENT" })) });
  ok(again.status === 200 && again.body.id === saved.body.id, "saving the same period again updates that register");
  const seen = (await call(student, "GET", `/attendance?from=${today}&to=${today}`)).body as { id: string; entries: { studentId: string }[] }[];
  const s12 = seen.find((s) => s.id === saved.body.id);
  ok(!!s12 && s12.entries.length === 1 && s12.entries[0].studentId === aliceId, "a student sees only their own entry in the register");
  ok((await call(student, "PUT", "/attendance", register)).status === 403, "a student cannot take attendance");
  ok((await call(teacher, "PUT", "/attendance", { ...register, entries: [{ studentId: outsider, status: "PRESENT" }] })).status === 400, "a student from another section is refused");
  ok((await call(teacher, "PUT", "/attendance", { ...register, date: "2099-01-01" })).status === 400, "future dates are refused");
  ok((await call(exams, "GET", "/attendance")).status === 200, "the exam controller can read attendance (admit cards)");
  const pct = (await call(student, "GET", `/students/${aliceId}`)).body.attendancePercent;
  ok(typeof pct === "number" && pct >= 0 && pct <= 100, "the student record carries an attendance percentage", pct);

  console.log("Exams & marks");
  const paper = { subjectId: subject("Mathematics"), date: today, startTime: "09:30", endTime: "12:30", maxMarks: 50, passMarks: 17 };
  ok((await call(principal, "POST", "/exams", { name: TAG, gradeNames: ["Class 10"], papers: [paper] })).status === 403, "the principal cannot create exams (exam controller's job)");
  const exam = await call(exams, "POST", "/exams", { name: TAG, gradeNames: ["Class 10"], papers: [paper] });
  ok(exam.status === 201 && exam.body.papers.length === 1 && exam.body.papers[0].subjectName === "Mathematics", "the exam controller creates an exam with its schedule", exam.body);
  const examId: string = exam.body.id;
  if (examId) created.exams.push(examId);
  ok((await call(exams, "POST", "/exams", { name: TAG, gradeNames: ["Class 10"] })).status === 400, "duplicate exam names are refused");
  ok((await call(exams, "POST", "/exams", { name: `${TAG}-x`, gradeNames: ["Class 10"], papers: [paper, paper] })).status === 400, "a subject twice in one schedule is refused");
  ok((await call(student, "GET", "/exams")).body.some((e: { id: string }) => e.id === examId), "students see the exam schedule");

  ok((await call(teacher, "PUT", "/marks", { examId, subjectId: paper.subjectId, entries: [{ studentId: aliceId, marks: 51 }] })).status === 400, "marks above the maximum are refused");
  ok((await call(student, "PUT", "/marks", { examId, subjectId: paper.subjectId, entries: [{ studentId: aliceId, marks: 40 }] })).status === 403, "a student cannot enter marks");
  const m1 = await call(teacher, "PUT", "/marks", { examId, subjectId: paper.subjectId, entries: [{ studentId: aliceId, marks: 42.5 }, { studentId: classmates.find((x) => x !== aliceId)!, marks: null, isAbsent: true }] });
  ok(m1.status === 200 && m1.body.saved === 2, "a teacher enters marks (one absent)", m1.body);
  const m2 = await call(teacher, "PUT", "/marks", { examId, subjectId: subject("Science"), entries: [{ studentId: aliceId, marks: 80 }] });
  const withPaper = (await call(exams, "GET", "/exams")).body.find((e: { id: string }) => e.id === examId);
  ok(m2.status === 200 && withPaper.papers.length === 2, "marks for a subject not in the schedule add that paper");
  const hidden = (await call(student, "GET", `/marks?examId=${examId}`)).body as unknown[];
  ok(hidden.length === 0, "students do not see unpublished results");
  ok((await call(teacher, "PATCH", `/exams/${examId}`, { resultsPublished: true })).status === 403, "a teacher cannot publish results");
  ok((await call(principal, "PATCH", `/exams/${examId}`, { resultsPublished: true })).status === 200, "the principal publishes results");
  const shown = (await call(parent, "GET", `/marks?examId=${examId}`)).body as { studentId: string; marks: number }[];
  ok(shown.length === 2 && shown.every((m) => m.studentId === aliceId) && shown.some((m) => m.marks === 42.5), "the parent then sees only their child's marks", shown);
  const staffView = (await call(principal, "GET", `/marks?examId=${examId}`)).body as { isAbsent: boolean }[];
  ok(staffView.length === 3 && staffView.filter((m) => m.isAbsent).length === 1, "staff see the whole class, absences included");
  const drop = await call(exams, "PATCH", `/exams/${examId}`, { papers: [{ ...paper, subjectId: subject("English") }] });
  ok(drop.status === 400, "a paper that has marks cannot be dropped from the schedule", drop.body);
  ok((await call(exams, "DELETE", `/exams/${examId}`)).status === 400, "an exam with marks cannot be deleted");
  await call(teacher, "PUT", "/marks", { examId, subjectId: paper.subjectId, entries: classmates.map((id) => ({ studentId: id, marks: null })) });
  await call(teacher, "PUT", "/marks", { examId, subjectId: subject("Science"), entries: [{ studentId: aliceId, marks: null }] });
  ok((await call(principal, "GET", `/marks?examId=${examId}`)).body.length === 0, "clearing marks removes them");
  ok((await call(exams, "DELETE", `/exams/${examId}`)).status === 204, "an exam without marks can be deleted");

  console.log("Assignments");
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const a = await call(teacher, "POST", "/assignments", { sectionId, subjectId: subject("Science"), title: TAG, description: "Test", dueDate: due, totalMarks: 20 });
  ok(a.status === 201, "a teacher creates an assignment", a.body);
  const aid: string = a.body.id;
  if (aid) created.assignments.push(aid);
  ok((await call(student, "POST", "/assignments", { sectionId, subjectId: subject("Science"), title: "x", dueDate: due, totalMarks: 5 })).status === 403, "a student cannot create assignments");
  const listed = (await call(student, "GET", "/assignments")).body as { id: string; teacherName: string }[];
  ok(listed.some((x) => x.id === aid && x.teacherName === "Ms. Priya Sharma"), "the student sees it, with the teacher's name");
  const sub = await call(student, "POST", `/assignments/${aid}/submissions`, { studentId: aliceId, fileName: `${TAG}.pdf`, sizeBytes: 2048, mimeType: "application/pdf" });
  ok(sub.status === 201, "the student hands in work", sub.body);
  ok((await call(student, "POST", `/assignments/${aid}/submissions`, { studentId: classmates.find((x) => x !== aliceId), fileName: "x.pdf" })).status === 403, "a student cannot hand in for a classmate");
  ok((await call(student, "PATCH", `/assignments/${aid}/submissions/${aliceId}`, { marksObtained: 20 })).status === 403, "a student cannot grade");
  ok((await call(teacher, "PATCH", `/assignments/${aid}/submissions/${aliceId}`, { marksObtained: 25 })).status === 400, "grades above the total are refused");
  ok((await call(teacher, "PATCH", `/assignments/${aid}/submissions/${aliceId}`, { marksObtained: 18, feedback: "Good" })).status === 200, "the teacher grades it");
  const graded = (await call(parent, "GET", "/assignments")).body.find((x: { id: string }) => x.id === aid);
  ok(graded?.submissions.length === 1 && graded.submissions[0].marksObtained === 18 && graded.submissions[0].fileName === `${TAG}.pdf`, "the parent sees the grade and the file name");
  ok((await call(student, "POST", `/assignments/${aid}/submissions`, { studentId: aliceId, fileName: "late.pdf" })).status === 400, "graded work cannot be resubmitted");
  ok((await call(teacher, "DELETE", `/assignments/${aid}`)).status === 204, "the teacher deletes the assignment");
  created.assignments = [];

  console.log("Study notes");
  const n = await call(teacher, "POST", "/notes", { sectionId, subjectId: subject("Science"), title: TAG, fileName: `${TAG}.pdf`, sizeBytes: 4096, mimeType: "application/pdf" });
  ok(n.status === 201, "a teacher uploads a note", n.body);
  const nid: string = n.body.id;
  if (nid) created.notes.push(nid);
  ok((await call(student, "GET", "/notes")).body.some((x: { id: string; uploadedBy: string }) => x.id === nid && x.uploadedBy === "Ms. Priya Sharma"), "the student sees the note");
  ok((await call(student, "POST", `/notes/${nid}/download`, {})).body.downloads === 1, "downloads are counted");
  ok((await call(student, "DELETE", `/notes/${nid}`)).status === 403, "a student cannot delete notes");
  ok((await call(teacher, "DELETE", `/notes/${nid}`)).status === 204, "the teacher deletes the note");
  created.notes = [];
}

async function cleanup() {
  if (restoreTimetable) await restoreTimetable();
  await withSystem(async (tx) => {
    await tx.attendanceEntry.deleteMany({ where: { sessionId: { in: created.sessions } } });
    await tx.attendanceSession.deleteMany({ where: { id: { in: created.sessions } } });
    const papers = await tx.examPaper.findMany({ where: { examId: { in: created.exams } }, select: { id: true } });
    await tx.mark.deleteMany({ where: { examPaperId: { in: papers.map((p) => p.id) } } });
    await tx.examPaper.deleteMany({ where: { examId: { in: created.exams } } });
    await tx.exam.deleteMany({ where: { id: { in: created.exams } } });
    await tx.assignmentSubmission.deleteMany({ where: { assignmentId: { in: created.assignments } } });
    await tx.assignment.deleteMany({ where: { id: { in: created.assignments } } });
    await tx.studyNote.deleteMany({ where: { id: { in: created.notes } } });
    await tx.attachment.deleteMany({ where: { fileName: { startsWith: TAG } } });
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
