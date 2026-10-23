/**
 * School website (public pages and forms) and the office side that receives them — website profile,
 * messages, alumni, careers, enquiries, visitors — against the "greenwood" demo organization:
 *   npm run test:website
 * Everything it creates is removed at the end; the website profile is restored.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

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
  const r = await call(null, "POST", "/auth/login", { organization: "greenwood", username, password: "Demo@1234" });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const TAG = `web-test-${Date.now()}`;
const PUB = "/public/greenwood";
let originalSite: unknown = null;

async function main() {
  const admin = await login("admin");
  const reception = await login("reception");
  const hr = await login("hr");
  const teacher = await login("T002");

  console.log("Public pages (no sign-in)");
  const site = await call(null, "GET", `${PUB}/site`);
  ok(site.status === 200 && site.body.name === "Greenwood International School", "the website profile is public", site.body?.name);
  const faculty = await call(null, "GET", `${PUB}/faculty`);
  ok(faculty.body.length > 5 && faculty.body.every((t: Record<string, unknown>) => !("phone" in t) && !("email" in t) && !("basicSalary" in t)), "the faculty list has no contact or salary details");
  const fees = await call(null, "GET", `${PUB}/fees`);
  ok(fees.body.some((f: { grade: string; annualAmount: number }) => f.grade === "Class 10" && f.annualAmount > 0), "tuition per class is public", fees.body);
  const exams = await call(null, "GET", `${PUB}/exams`);
  ok(exams.status === 200 && exams.body.every((e: { papers: { date: string }[] }) => e.papers.length), "upcoming datesheets are public", exams.body.map((e: { name: string }) => e.name));
  const jobs = await call(null, "GET", `${PUB}/jobs`);
  ok(jobs.body.length > 0 && jobs.body.every((j: { isOpen: boolean }) => j.isOpen) && jobs.body.some((j: { campus: string }) => j.campus), "open jobs are public, with their campus");

  console.log("Website forms");
  ok((await call(null, "POST", `${PUB}/enquiries`, { studentName: TAG, parentName: "Test Parent", phone: "+91 90000 12345", email: "", grade: "6", notes: "From test" })).status === 201, "an admission enquiry is received");
  ok((await call(null, "POST", `${PUB}/enquiries`, { studentName: TAG, parentName: "Test Parent", phone: "abc", grade: "6" })).status === 400, "a bad phone number is refused");
  ok((await call(null, "POST", `${PUB}/contact`, { kind: "Grievance", name: "Test Person", phone: "9000012345", email: "t@example.com", subject: TAG, message: "Water cooler broken" })).status === 201, "a grievance is received");
  const job = jobs.body.find((j: { lastDate: string }) => j.lastDate >= new Date().toISOString().slice(0, 10));
  const app = await call(null, "POST", `${PUB}/applications`, { jobId: job?.id ?? null, name: TAG, email: "applicant@example.com", phone: "9000012345", qualification: "M.Sc., B.Ed.", experienceYears: 4, resumeName: `${TAG}.pdf` });
  ok(app.status === 201, "a job application is received (with the resume's name)", app.body);
  const expired = jobs.body.find((j: { lastDate: string }) => j.lastDate < new Date().toISOString().slice(0, 10));
  if (expired) ok((await call(null, "POST", `${PUB}/applications`, { jobId: expired.id, name: TAG, email: "a@example.com", phone: "9000012345", qualification: "B.Ed.", experienceYears: 1 })).status === 400, "applications after the last date are refused");
  ok((await call(null, "POST", `${PUB}/alumni`, { name: TAG, batch: "2012", email: "alum@example.com", phone: "", occupation: "Engineer", city: "Pune" })).status === 201, "an alumni registration is received");
  ok((await call(null, "POST", `${PUB}/alumni`, { name: TAG, batch: "2099", email: "alum@example.com" })).status === 400, "a future batch year is refused");
  ok((await call(null, "POST", "/public/demo-requests", { name: TAG, institution: "Test School", phone: "9000012345", city: "Pune", branches: "2" })).status === 201, "a product demo request is received");
  ok((await call(null, "POST", "/public/nosuch/enquiries", { studentName: "x", parentName: "y", phone: "9000012345", grade: "1" })).status === 404, "forms for an unknown school are refused");

  console.log("Office side");
  const enquiries = (await call(reception, "GET", "/enquiries")).body as { id: string; studentName: string; source: string; status: string }[];
  const webEnquiry = enquiries.find((e) => e.studentName === TAG);
  ok(webEnquiry?.source === "Website" && webEnquiry.status === "NEW", "reception sees the website enquiry");
  ok((await call(teacher, "GET", "/enquiries")).status === 403, "a teacher cannot see enquiries");
  const followUp = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const upd = await call(reception, "PATCH", `/enquiries/${webEnquiry!.id}`, { status: "Visit Scheduled", followUpDate: followUp });
  ok(upd.status === 200 && upd.body.status === "VISIT_SCHEDULED" && upd.body.followUpDate === followUp, "reception schedules a visit", upd.body);
  const walkIn = await call(reception, "POST", "/enquiries", { studentName: `${TAG} walk-in`, parentName: "Walk In", phone: "9000099999", grade: "3", source: "Walk-in" });
  ok(walkIn.status === 201, "reception records a walk-in enquiry", walkIn.body);

  const visitor = await call(reception, "POST", "/visitors", { name: TAG, phone: "9000011111", purpose: "Parent meeting", toMeet: "Principal", people: 2 });
  ok(visitor.status === 201 && !visitor.body.outAt, "reception checks a visitor in", visitor.body);
  ok((await call(reception, "POST", `/visitors/${visitor.body.id}/checkout`, {})).body.outAt != null, "…and out");
  ok((await call(reception, "POST", `/visitors/${visitor.body.id}/checkout`, {})).status === 409, "a visitor cannot check out twice");

  const messages = (await call(reception, "GET", "/website/messages")).body as { id: string; subject: string; kind: string; resolved: boolean }[];
  const grievance = messages.find((m) => m.subject === TAG);
  ok(grievance?.kind === "GRIEVANCE", "the office sees the grievance");
  await call(reception, "PATCH", `/website/messages/${grievance!.id}`, { resolved: true });
  ok(((await call(admin, "GET", "/website/messages")).body as { id: string; resolved: boolean }[]).find((m) => m.id === grievance!.id)?.resolved === true, "…and resolves it");
  ok((await call(teacher, "GET", "/website/messages")).status === 403, "a teacher cannot read website messages");
  ok(((await call(admin, "GET", "/website/alumni")).body as { name: string }[]).some((a) => a.name === TAG), "the admin sees the alumni registration");

  const apps = (await call(hr, "GET", "/job-applications")).body as { id: string; name: string; resumeName: string; status: string }[];
  const mine = apps.find((a) => a.name === TAG);
  ok(mine?.resumeName === `${TAG}.pdf` && mine.status === "APPLIED", "HR sees the application with its resume name", mine);
  ok((await call(hr, "PATCH", `/job-applications/${mine!.id}`, { status: "INTERVIEW" })).status === 400, "an interview needs a date");
  ok((await call(hr, "PATCH", `/job-applications/${mine!.id}`, { status: "INTERVIEW", interviewDate: followUp })).status === 200, "HR schedules the interview");
  ok((await call(teacher, "GET", "/job-applications")).status === 403, "a teacher cannot see applications");
  const posted = await call(hr, "POST", "/jobs", { title: TAG, department: "Science", category: "TEACHING", employmentType: "FULL_TIME", campus: "Junior Wing, Aliganj", vacancies: 1, qualification: "M.Sc.", description: "Test opening", responsibilities: ["Teach"], lastDate: followUp });
  ok(posted.status === 201 && posted.body.campus === "Junior Wing, Aliganj", "HR posts a job", posted.body);
  ok(((await call(null, "GET", `${PUB}/jobs`)).body as { title: string }[]).some((j) => j.title === TAG), "it appears on the website");
  await call(hr, "PATCH", `/jobs/${posted.body.id}`, { isOpen: false });
  ok(!((await call(null, "GET", `${PUB}/jobs`)).body as { title: string }[]).some((j) => j.title === TAG), "a closed job leaves the website");

  console.log("Website profile");
  originalSite = (await call(admin, "GET", "/website")).body;
  ok((await call(reception, "PUT", "/website", { ...(originalSite as object), tagline: "x" })).status === 403, "only an admin edits the website");
  ok((await call(admin, "PUT", "/website", { ...(originalSite as object), tagline: TAG })).status === 200, "the admin edits the website");
  ok((await call(null, "GET", `${PUB}/site`)).body.tagline === TAG, "the change is live on the public site");
}

async function cleanup() {
  await withSystem(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { subdomain: "greenwood" }, select: { id: true, settings: true } });
    if (originalSite) {
      const settings = JSON.parse(org.settings ?? "{}");
      await tx.organization.update({ where: { id: org.id }, data: { settings: JSON.stringify({ ...settings, website: originalSite }) } });
    }
    await tx.enquiry.deleteMany({ where: { studentName: { startsWith: TAG } } });
    await tx.visitor.deleteMany({ where: { name: TAG } });
    await tx.contactMessage.deleteMany({ where: { subject: TAG } });
    await tx.alumniMember.deleteMany({ where: { name: TAG } });
    const apps = await tx.jobApplication.findMany({ where: { name: TAG }, select: { id: true, resumeFileId: true } });
    await tx.jobApplication.deleteMany({ where: { id: { in: apps.map((a) => a.id) } } });
    await tx.attachment.deleteMany({ where: { id: { in: apps.map((a) => a.resumeFileId).filter((x): x is string => !!x) } } });
    await tx.jobOpening.deleteMany({ where: { title: TAG } });
    await tx.demoLead.deleteMany({ where: { name: TAG } });
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
