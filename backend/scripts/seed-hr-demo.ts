/**
 * Demo data for the HR suite in the "greenwood" organization, created through the API like a user would:
 *   npx tsx scripts/seed-hr-demo.ts
 * Two trainings (an ongoing induction and an upcoming skill workshop) with slides, a test and participants,
 * and an expense claim by a teacher. Skips anything that already exists, so it can be run again.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.status >= 400) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}
const login = async (username: string) => (await call(null, "POST", "/auth/login", { organization: "greenwood", username, password: "Demo@1234" })).accessToken as string;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const TRAININGS = [
  {
    title: "Induction: school policies & child safety", category: "INDUCTION", trainerName: "HR Manager", mode: "CLASSROOM", venue: "Conference room", startDate: day(-2), endDate: day(1), durationHours: 6, passPercent: 60,
    description: "Everything a new member of staff needs in the first week — how the school runs, child protection and the ERP.",
    slides: [
      { title: "Welcome to Greenwood", body: "- Our vision: every child known, every child growing\n- 1,200 students, 80 staff, two campuses\n- Your buddy will help you through the first month" },
      { title: "A day at school", body: "- Staff report by 7:45 am; assembly at 8:00\n- Mark class attendance in the ERP in the first period\n- Duty roster: gate, corridors, lunch" },
      { title: "Child protection", body: "- Never be alone with a child behind a closed door\n- Report any concern to the designated officer the same day\n- No personal phone numbers or social media with students" },
      { title: "Leave & attendance", body: "- Apply for leave in the ERP (My Leave) in advance\n- Unapproved absence is loss of pay\n- Casual 12, sick 10, earned 15 days a year" },
      { title: "Your HR self-service", body: "- Payslips, expense claims and trainings under My HR\n- Claims within 90 days, paid with the next salary" },
    ],
    questions: [
      { question: "By when must class attendance be marked?", options: ["End of the day", "In the first period", "Before the weekend", "Only on exam days"], answerIndex: 1 },
      { question: "You have a concern about a child's safety. What do you do?", options: ["Wait a week", "Ask other students", "Tell the designated officer the same day", "Post in the staff group"], answerIndex: 2 },
      { question: "How many casual leave days are there in a year?", options: ["6", "10", "12", "15"], answerIndex: 2 },
      { question: "Which of these is allowed?", options: ["Sharing your phone number with students", "Meeting a student alone behind a closed door", "Messaging parents through the ERP", "Adding students on social media"], answerIndex: 2 },
      { question: "Within how many days must an expense be claimed?", options: ["30", "60", "90", "365"], answerIndex: 2 },
    ],
  },
  {
    title: "Smart classroom: teaching with the interactive board", category: "SKILL", trainerName: "External — EduTech Solutions", mode: "CLASSROOM", venue: "Smart lab, Block B", startDate: day(10), endDate: day(10), durationHours: 3, passPercent: 50,
    description: "Hands-on workshop on the interactive boards installed this term.",
    slides: [
      { title: "Why interactive boards", body: "- More participation, especially from quieter students\n- Save and share every board as notes" },
      { title: "Getting started", body: "- Switch on, calibrate, open the whiteboard app\n- Pens, eraser, shapes and the ruler" },
      { title: "Lesson ideas", body: "- Drag-and-drop sorting for science\n- Annotate a poem in English\n- Live graphs in maths" },
    ],
    questions: [
      { question: "What should you do first after switching the board on?", options: ["Calibrate it", "Restart it", "Unplug the projector", "Nothing"], answerIndex: 0 },
      { question: "How can students get today's board work?", options: ["Photograph it", "Save the board and upload it as notes", "Copy it by hand only", "It cannot be shared"], answerIndex: 1 },
      { question: "Which activity suits the board best?", options: ["Silent reading", "Drag-and-drop sorting", "Written exams", "PT period"], answerIndex: 1 },
    ],
  },
];

async function main() {
  const hr = await login("hr");
  const teacher = await login("T002");
  const staff = await call<{ id: string; employeeCode: string; staffType: string }[]>(hr, "GET", "/staff?type=TEACHING");
  const participants = staff.slice(0, 8).map((s) => s.id);
  const existing = await call<{ title: string }[]>(hr, "GET", "/trainings");

  for (const t of TRAININGS) {
    if (existing.some((e) => e.title === t.title)) { console.log(`exists: ${t.title}`); continue; }
    const { questions, ...body } = t;
    const created = await call<{ id: string }>(hr, "POST", "/trainings", { ...body, status: t.startDate <= day(0) ? "ONGOING" : "PLANNED" });
    await call(hr, "PUT", `/trainings/${created.id}/questions`, { questions });
    await call(hr, "POST", `/trainings/${created.id}/enroll`, { staffIds: participants });
    console.log(`training: ${t.title} (${participants.length} participants)`);
  }

  const claims = await call<{ description: string }[]>(teacher, "GET", "/expense-claims?mine=1");
  if (!claims.some((c) => c.description.startsWith("Auto fare to the CBSE"))) {
    const c = await call<{ claimNo: string }>(teacher, "POST", "/expense-claims", { date: day(-5), category: "Travel", description: "Auto fare to the CBSE science workshop and back", amount: 340, receiptName: "auto-receipt.jpg" });
    console.log(`claim: ${c.claimNo}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { server.close(); await prisma.$disconnect(); });
