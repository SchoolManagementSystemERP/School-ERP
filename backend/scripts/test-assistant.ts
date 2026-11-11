/**
 * Jarvis (voice assistant) checks against the "greenwood" demo organization:
 *   npm run test:assistant
 * Data questions are answered without the AI model, so Ollama does not need to be running.
 * Checks: answers come from the database, each role sees only what it may, memory works and can be
 * cleared, and other users never see someone's memory. The test users' memory is cleared at the end.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
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

  console.log("Memory");
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
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
