/**
 * Notice board, messages and the public notices endpoint, against the "greenwood" demo organization:
 *   npm run test:communication
 * Everything it creates is removed at the end.
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

const TAG = `comm-test-${Date.now()}`;

async function main() {
  const principal = await login("principal");
  const teacher = await login("T002");
  const student = await login("ADM-2025-1001");
  const parent = await login("9876511111");
  const accountant = await login("accountant");
  const aliceId: string = (await call(student, "GET", "/me")).body.students[0].id;
  const alice = (await call(student, "GET", `/students/${aliceId}`)).body;
  const sections = ((await call(principal, "GET", "/grades")).body as { name: string; sections: { id: string; name: string }[] }[]).flatMap((g) => g.sections.map((s) => ({ ...s, full: `${g.name}-${s.name}` })));
  const other = sections.find((s) => s.id !== alice.class.sectionId)!;

  console.log("Announcements");
  const forAll = await call(principal, "POST", "/announcements", { title: `${TAG} all`, body: "For everyone", category: "event", priority: "high", audience: [{ type: "EVERYONE" }] });
  const forStaff = await call(principal, "POST", "/announcements", { title: `${TAG} staff`, body: "Staff only", audience: [{ type: "STAFF" }] });
  const forParents = await call(principal, "POST", "/announcements", { title: `${TAG} parents`, body: "Parents only", audience: [{ type: "PARENTS" }] });
  const forOther = await call(teacher, "POST", "/announcements", { title: `${TAG} other class`, body: "Another section", audience: [{ type: "SECTION", sectionId: other.id }] });
  ok(forAll.status === 201 && forStaff.status === 201 && forParents.status === 201, "the principal posts notices");
  ok(forOther.status === 201, "a teacher posts to a class", forOther.body);
  ok((await call(teacher, "POST", "/announcements", { title: "x", body: "x", audience: [{ type: "EVERYONE" }] })).status === 403, "a teacher cannot post to the whole school");
  ok((await call(student, "POST", "/announcements", { title: "x", body: "x", audience: [{ type: "SECTION", sectionId: alice.class.sectionId }] })).status === 403, "a student cannot post notices");
  ok((await call(accountant, "POST", "/announcements", { title: "x", body: "x", audience: [{ type: "EVERYONE" }] })).status === 403, "roles without announcements.send cannot post");

  const titles = async (t: string) => ((await call(t, "GET", "/announcements")).body as { title: string }[]).map((a) => a.title).filter((x) => x.startsWith(TAG));
  const seenByStudent = await titles(student);
  const seenByParent = await titles(parent);
  const seenByTeacher = await titles(teacher);
  ok(seenByStudent.includes(`${TAG} all`) && !seenByStudent.includes(`${TAG} staff`) && !seenByStudent.includes(`${TAG} parents`) && !seenByStudent.includes(`${TAG} other class`), "a student sees everyone-notices only (not staff, parent or other-class notices)", seenByStudent);
  ok(seenByParent.includes(`${TAG} parents`) && !seenByParent.includes(`${TAG} staff`), "a parent also sees parent notices", seenByParent);
  ok(seenByTeacher.length === 4, "staff see all of the branch's notices", seenByTeacher);
  const posted = (await call(principal, "GET", "/announcements")).body.find((a: { title: string }) => a.title === `${TAG} all`);
  ok(posted?.fromRole === "principal" && posted.category === "EVENT" && posted.audience[0].type === "EVERYONE", "a notice carries who posted it and its audience", posted);
  const teacherPost = (await call(principal, "GET", "/announcements")).body.find((a: { title: string }) => a.title === `${TAG} other class`);
  ok(teacherPost?.fromRole === "teacher" && teacherPost.audience[0].sectionName === other.full, "section notices name the class", teacherPost);

  const pub = await call(null, "GET", "/public/greenwood/announcements");
  const pubTitles = (pub.body as { title: string }[]).map((a) => a.title);
  ok(pub.status === 200 && pubTitles.includes(`${TAG} all`) && !pubTitles.some((t) => t === `${TAG} staff` || t === `${TAG} parents`), "the public website shows everyone-notices only, without sign-in");
  ok(!("fromName" in (pub.body[0] ?? {})), "public notices do not reveal who posted them");
  ok((await call(null, "GET", "/public/no-such-school/announcements")).status === 404, "an unknown school is not found");

  ok((await call(student, "DELETE", `/announcements/${forAll.body.id}`)).status === 403, "a student cannot remove notices");
  ok((await call(teacher, "DELETE", `/announcements/${forAll.body.id}`)).status === 403, "a teacher cannot remove the principal's notice");
  ok((await call(teacher, "DELETE", `/announcements/${forOther.body.id}`)).status === 204, "a teacher removes their own notice");
  for (const a of [forAll, forStaff, forParents]) await call(principal, "DELETE", `/announcements/${a.body.id}`);
  ok((await titles(principal)).length === 0, "the principal removes notices");

  console.log("Messages");
  const priyaStaffId: string = (await call(teacher, "GET", "/me")).body.staff.id;
  const m1 = await call(student, "POST", "/messages", { to: { kind: "staff", staffId: priyaStaffId }, subject: TAG, body: "Doubt in physics" });
  ok(m1.status === 201, "a student writes to a teacher", m1.body);
  const m2 = await call(parent, "POST", "/messages", { to: { kind: "staff", staffId: priyaStaffId }, subject: `${TAG} parent`, body: "About Alice" });
  ok(m2.status === 201, "a parent writes to a teacher", m2.body);
  ok((await call(student, "POST", "/messages", { to: { kind: "student", studentId: aliceId }, subject: "x", body: "x" })).status === 400, "nobody can message themselves");
  const classmate = ((await call(principal, "GET", "/students/full")).body as { id: string; hasLogin: boolean }[]).find((s) => s.id !== aliceId && s.hasLogin)!;
  ok((await call(student, "POST", "/messages", { to: { kind: "student", studentId: classmate.id }, subject: "x", body: "x" })).status === 403, "students cannot message other students");

  const inbox = (await call(teacher, "GET", "/messages")).body as { id: string; subject: string; from: { kind: string; studentId: string; name: string }; readAt: string | null }[];
  const fromStudent = inbox.find((m) => m.subject === TAG);
  const fromParent = inbox.find((m) => m.subject === `${TAG} parent`);
  ok(fromStudent?.from.kind === "student" && fromStudent.from.studentId === aliceId, "the teacher sees who wrote: the student", fromStudent?.from);
  ok(fromParent?.from.kind === "parent" && fromParent.from.studentId === aliceId, "…and the parent, with the child the message is about", fromParent?.from);
  const reply = await call(teacher, "POST", "/messages", { to: { kind: "parent", studentId: aliceId }, subject: `Re: ${TAG} parent`, body: "Thanks" });
  ok(reply.status === 201, "the teacher replies to the parent", reply.body);
  ok(((await call(parent, "GET", "/messages")).body as { subject: string }[]).some((m) => m.subject === `Re: ${TAG} parent`), "the parent receives the reply");
  ok(!((await call(student, "GET", "/messages")).body as { subject: string }[]).some((m) => m.subject.includes(`${TAG} parent`)), "the student does not see the parent's conversation");
  ok((await call(student, "POST", `/messages/${fromStudent!.id}/read`, {})).status === 404, "only the recipient can mark a message read");
  await call(teacher, "POST", `/messages/${fromStudent!.id}/read`, {});
  ok(((await call(teacher, "GET", "/messages")).body as { id: string; readAt: string | null }[]).find((m) => m.id === fromStudent!.id)?.readAt != null, "the teacher marks it read");
  const oversight = (await call(principal, "GET", "/messages?scope=school")).body as { subject: string }[];
  ok(oversight.filter((m) => m.subject.includes(TAG)).length === 3, "the principal can oversee the school's messages");
  ok((await call(teacher, "GET", "/messages?scope=school")).status === 403, "a teacher cannot");
}

async function cleanup() {
  await withSystem(async (tx) => {
    const anns = await tx.announcement.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } });
    await tx.announcementAudience.deleteMany({ where: { announcementId: { in: anns.map((a) => a.id) } } });
    await tx.announcement.deleteMany({ where: { id: { in: anns.map((a) => a.id) } } });
    await tx.message.deleteMany({ where: { subject: { contains: TAG } } });
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
