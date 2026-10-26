/**
 * Group office over HTTP, against the "greenwood" demo group (after `npm run import:frontend`, migration 011
 * and `npm run seed:group`):
 *   npm run test:group
 * Who may open the group dashboard, that each sees only the schools in their scope, and that the
 * totals add up. Read-only — nothing is created.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ✓" : "  ✗"} ${label}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string | null, method: string, path: string) {
  const res = await fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string, organization = "greenwood") {
  const res = await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization, username, password: "Demo@1234" }) });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${await res.text()}`);
  return (await res.json()).accessToken as string;
}

type School = { id: string; code: string; regionId: string | null; students: number; fees: { collected: number; overdue: number }; attendancePercent: number | null };

async function main() {
  console.log("Built-in roles");
  const roles = await withSystem((tx) => tx.role.findMany({ where: { organizationId: null }, select: { code: true, level: true } }));
  const want = ["DIRECTOR", "TRUST_SECRETARY", "TREASURER", "TRUSTEE", "ADMISSIONS_HEAD", "PURCHASE_HEAD", "IT_HEAD", "COMPLIANCE_OFFICER", "INTERNAL_AUDITOR", "INSPECTION_OFFICER", "TRANSPORT_HEAD", "MARKETING_HEAD", "TRAINING_COORDINATOR", "CLUSTER_HEAD"];
  ok(want.every((c) => roles.some((r) => r.code === c)), "the 14 head-office and cluster roles exist", want.filter((c) => !roles.some((r) => r.code === c)));
  ok(roles.find((r) => r.code === "CLUSTER_HEAD")?.level === "REGION", "the cluster head is a region-level role");
  const regionOffice = ["ASST_REGIONAL_DIRECTOR", "REGIONAL_ACADEMIC_COORDINATOR", "SUBJECT_COORDINATOR", "REGIONAL_EXAM_COORDINATOR", "REGIONAL_INSPECTOR", "REGIONAL_TRAINING_COORDINATOR", "REGIONAL_COUNSELLING_COORDINATOR", "REGIONAL_ACCOUNTS_OFFICER", "REGIONAL_AUDITOR", "REGIONAL_HR_OFFICER", "REGIONAL_ADMISSIONS_COORDINATOR", "REGIONAL_PURCHASE_OFFICER", "REGIONAL_TRANSPORT_COORDINATOR", "REGIONAL_INFRASTRUCTURE_OFFICER", "REGIONAL_IT_COORDINATOR", "REGIONAL_SPORTS_COORDINATOR", "REGIONAL_PR_OFFICER", "REGIONAL_OFFICE_STAFF"];
  ok(regionOffice.every((c) => roles.find((r) => r.code === c)?.level === "REGION"), "the 18 region-office roles exist, all region-level", regionOffice.filter((c) => roles.find((r) => r.code === c)?.level !== "REGION"));

  console.log("Who may open the group dashboard");
  const chairman = await login("chairman");
  const all = await call(chairman, "GET", "/group/overview");
  ok(all.status === 200 && all.body.schools.length === 3, "the chairman sees all three schools", all.body?.schools?.length ?? all.body);
  const regional = await call(await login("regional.manager"), "GET", "/group/overview");
  const lucknow = regional.body?.schools?.map((s: School) => s.code).sort();
  ok(regional.status === 200 && JSON.stringify(lucknow) === JSON.stringify(["GIS-AG", "GIS-GN"]), "the Lucknow regional manager sees only the two Lucknow schools", lucknow);
  for (const user of ["director", "treasurer", "trustee", "auditor", "inspection"]) {
    ok((await call(await login(user), "GET", "/group/overview")).status === 200, `${user} (head office) opens the dashboard`);
  }
  for (const user of ["lko.asst.director", "lko.academic", "lko.exams", "lko.accounts", "lko.hr", "lko.office"]) {
    const r = await call(await login(user), "GET", "/group/overview");
    ok(r.status === 200 && JSON.stringify(r.body.schools.map((s: School) => s.code).sort()) === JSON.stringify(["GIS-AG", "GIS-GN"]), `${user} (Lucknow region office) sees only the Lucknow schools`, r.body?.schools?.map((s: School) => s.code) ?? r.body);
  }
  const cluster = await call(await login("cluster.head"), "GET", "/group/overview");
  ok(cluster.status === 200 && cluster.body.schools.length === 1 && cluster.body.schools[0].code === "GIS-KNP", "the Kanpur cluster head sees only the Kanpur school", cluster.body?.schools?.map((s: School) => s.code));
  ok((await call(await login("principal"), "GET", "/group/overview")).status === 403, "a principal cannot open the group dashboard");
  ok((await call(await login("T001"), "GET", "/group/overview")).status === 403, "a teacher cannot open the group dashboard");
  ok((await call(null, "GET", "/group/overview")).status === 401, "nobody signed out");
  const otherOrg = await call(await login("chairman", "dav"), "GET", "/group/overview");
  ok(otherOrg.status === 200 && otherOrg.body.schools.length > 0 && otherOrg.body.schools.every((s: School) => !all.body.schools.some((d: School) => d.id === s.id)), "another organization never sees Greenwood's schools");

  console.log("Numbers");
  const t = all.body.totals;
  const sum = (f: (s: School) => number) => all.body.schools.reduce((a: number, s: School) => a + f(s), 0);
  ok(t.students === sum((s) => s.students) && t.fees.collected === sum((s) => s.fees.collected) && t.fees.overdue === sum((s) => s.fees.overdue), "group totals are the sum of the schools", t);
  ok(all.body.regions.length === 2 && all.body.regions.reduce((a: number, r: { schools: number }) => a + r.schools, 0) === 3, "region subtotals cover every school once");
  const students = await withSystem((tx) => tx.student.count({ where: { branchId: { in: all.body.schools.map((s: School) => s.id) }, status: "ACTIVE" } }));
  ok(t.students === students, "student count matches the database", { api: t.students, db: students });
  ok(all.body.schools.every((s: School) => s.attendancePercent == null || (s.attendancePercent >= 0 && s.attendancePercent <= 100)), "attendance is a percentage");
  ok(all.body.collectionTrend.length === 6, "six months of fee collection");
  ok(!JSON.stringify(all.body).match(/admissionNo|firstName|phone|aadhaar/i), "no personal records in the response");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { server.close(); await prisma.$disconnect(); });
