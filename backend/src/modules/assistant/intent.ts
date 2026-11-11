/**
 * Picks the data tool for common questions without the AI model, and writes the reply from the data.
 * Small local models pick wrong tools and invent numbers; school data answers must be exact, so the
 * usual questions (fees, attendance, marks, phone numbers, who is absent, leave, stock, library,
 * school totals) are understood here and answered word for word from the database.
 */

import { matchList } from './erp-read.js';

const KEYWORDS = {
  fees: /\b(fees?|fess|फीस|baa?ki|bakaya|due|dues|outstanding|bhugtan|jama)\b/u,
  defaulters: /\b(sabse (zyada|jyada|adhik)|defaulters?|kis(ki|ke|ka)?|kaun kaun|list|sab(hi)? (students|bachche))\b/u,
  attendance: /\b(attendance|attendence|hazir|haazir|hazri|haziri|हाजिरी|उपस्थिति|absent|present|gair ?hazir|anupasthit|aaye|aayi|nahi aaya|nahi aayi)\b/u,
  marks: /\b(marks?|results?|rizalt|अंक|percentage|percent|exam|pariksha|grade|number aaye|kitne number)\b/u,
  contact: /\b(phone|mobile|contact|papa|pita|father|mummy|mother|mata|parents?|guardian|abhibhavak|admission( no| number)?|roll( no| number)?|kis class|kaun si class|details?|jaankari|info)\b/u,
  staff: /\b(sir|madam|maam|mam|teacher|staff|employee|karmchari|shikshak)\b/u,
  leave: /\b(chhutti|chutti|chhuti|leave|छुट्टी|avkash)\b/u,
  stock: /\b(stock|inventory|saa?maa?n|store item|items? kam)\b/u,
  library: /\b(library|book|books|kitab|kitaab|किताब|pustak)\b/u,
  libraryLate: /\b(overdue|return|wapas|waapas|late|nahi lautai|due)\b/u,
  summary: /\b(kitne (students|bachche|bacche|staff|teachers?)|total (kitne )?(students|staff|teachers?)|summary|overview|school (ka|ki) (haal|status|report)|collection)\b/u,
};

/** Words that are part of the question, not of a person's name. */
const STOP = new Set(`
ki ka ke ko se me mein main mai hai hain tha the thi kya kitni kitna kitne kaisi kaisa kaise kab kaun kis kiska kiski kiske
batao bataiye bataye bata dikhao dikhaiye btao bolo please plz zara jara aaj kal abhi is iss us yeh ye wo woh
mera meri mere hamara hamari humara apna apni apne beta beti bachcha bachche bacche bachchi student students
fee fees fess baaki baki bakaya due dues jama total paid outstanding amount paisa rupees
attendance attendence hazir haazir hazri haziri absent present aaya aayi aaye nahi nhi
marks mark result results exam exams percentage percent number numbers grade
phone mobile contact papa pita father mummy mother mata parent parents guardian admission roll details detail jaankari info
class section sir madam maam mam teacher staff employee leave chhutti chutti
school aur sab sabhi sabse zyada jyada adhik kul pe par wala wali wale ji list kitno kaunse konsa konsi
overdue defaulter defaulters summary overview haal status report collection batana chahiye janna
uski uska uske iski iska iske unki unka unke inki inka inke usko isko unko inko vo wo woh unhone usne
jarvis jarvish jervis hey hello hi namaste mujhe muje mujko humko hume dekhna dekhni dekhne dekho dekh dikhao dikha dikhana
chahiye chaiye karo kar karna kariye do de dena dijiye bhai yaar sir maam bas wala wali ok okay accha theek thik haan han ha
abhi zara sa vala vali pata malum maloom maaloom kuch koi samjha samajh samjhe hmm umm
the of for what is how much tell me show give a an and or in on with please
timetable time table schedule period periods routine somvar mangalvar budhvar guruvar shukravar shanivar ravivar parso
monday tuesday wednesday thursday friday saturday sunday homework home work assignment assignments grihkarya
date sheet datesheet paper papers upcoming agla agli agle next aane hone wala shuru
bus van transport route stop pickup driver gaadi holiday holidays vacation band notice notices suchna circular announcement
message salary payslip slip tankhwah vetan address email timing timings
cash nakad upi cheque check card online collect receive record lo le lijiye payment
approve approved reject rejected manjoor manzoor sweekar accept naamanjoor namanjoor asweekar mana request application arzi
good morning suprabhat briefing update kaunsi kaunsa konse kaun-si time samay
bacchon bachchon baccho bachcho bacchon vidyarthiyon studenton logon bache bachhe bachey bacha baccha ladke ladkiyan ladka ladki
strength ginti sankhya total
dono donon aur bhi sath saath usne isne unhone inhone use ise unhe inhe di diya diye bhari bhara fail failed kamzor weak
raha rahi rahe gaya gayi kaisa kaisi achha accha acchi kharab ranking compare baare bare profile poori puri
thank thanks shukriya dhanyavaad bye alvida hello namaste kaun tum aap
`.split(/\s+/).filter(Boolean));

export type Intent = { tool: string; args: Record<string, unknown> };

function normalize(text: string) {
  return text.toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** "10 A", "class 10-a", "LKG B" anywhere in the question. */
export function classIn(text: string): string | null {
  const m = normalize(text).match(/\b(?:class\s*)?(\d{1,2}|lkg|ukg|nursery)\s*[- ]?\s*([a-h])\b/);
  if (m) return `${m[1]} ${m[2].toUpperCase()}`;
  const g = normalize(text).match(/\bclass\s*(\d{1,2}|lkg|ukg|nursery)\b/);
  return g ? g[1] : null;
}

/** Real name words of the people the user may ask about (set while planTurn runs). */
let activeNames: Set<string> | null = null;

/** One typing / hearing slip: "akash" ~ "aakash", "riyaa" ~ "riya" (only for longer words). */
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * The person's name in a question. With the name index: only words that are real names in the school
 * (or one slip away from one) — so "di ya nahi", "fail" or "thank you" are never taken as a name.
 * Without it: the words left once question words and the class are removed.
 */
export function nameIn(text: string, names: Set<string> | null = activeNames): string {
  if (names) {
    let t = normalize(text);
    const cls = t.match(/\b(?:class\s*)?(\d{1,2}|lkg|ukg|nursery)\s*[- ]?\s*([a-h])?\b/);
    if (cls) t = t.replace(cls[0], ' ');
    const found: string[] = [];
    for (const word of t.split(' ')) {
      if (word.length < 3 || /^\d+$/.test(word) || STOP.has(word)) continue;
      if (names.has(word)) { found.push(word); continue; }
      if (word.length >= 5) {
        for (const name of names) if (name.length >= 5 && oneEditApart(word, name)) { found.push(name); break; }
      }
    }
    return [...new Set(found)].slice(0, 3).join(' ');
  }
  let t = normalize(text);
  const cls = t.match(/\b(?:class\s*)?(\d{1,2}|lkg|ukg|nursery)\s*[- ]?\s*([a-h])?\b/);
  if (cls) t = t.replace(cls[0], ' ');
  return t.split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).slice(0, 3).join(' ');
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(monday|somvar|somwar)\b/, 1], [/\b(tuesday|mangalvar|mangalwar)\b/, 2], [/\b(wednesday|budhvar|budhwar)\b/, 3],
  [/\b(thursday|guruvar|guruwar|brihaspativar)\b/, 4], [/\b(friday|shukravar|shukrawar)\b/, 5], [/\b(saturday|shanivar|shaniwar)\b/, 6],
  [/\b(sunday|ravivar|raviwar|itwar)\b/, 7],
];

/** "kal", "parso", "monday" → YYYY-MM-DD (today when no day is named). For a timetable "kal" means tomorrow. */
export function dateIn(text: string): string {
  const q = normalize(text);
  const now = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  let offset = 0;
  if (/\bparso\b/.test(q)) offset = 2;
  else if (/\b(kal|tomorrow)\b/.test(q)) offset = 1;
  else {
    const weekday = WEEKDAYS.find(([pattern]) => pattern.test(q))?.[1];
    if (weekday) {
      const current = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
      offset = (weekday - current + 7) % 7;
    }
  }
  return new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

const NOTICE_STOP = new Set('notice notices suchna circular announcement announcements wala wali wale dikhao dikhaiye batao bataiye kya hai hain koi aaj kal haal latest naya naye nayi recent sab sabhi mujhe jarvis padho sunao board aaya aayi aaye'.split(' '));
const NOTICE_WORD =/\b(notice|suchna|circular|announcement|message|सूचना)\b/u;
const SEND_WORD = /\b(bhejo|bhej do|bhejna|bhej dijiye|send|post karo|post kar do|laga do|lagao|daal do)\b/u;

/** "class 10 A ke parents ko notice bhejo ki kal school band rahega" → who and what. */
export function noticeParts(question: string) {
  const match = question.match(/(?:notice|suchna|circular|announcement|message|सूचना)[^:]*?(?:\s(?:ki|that|likho|likh do|ke liye ki)\s+|:\s*)(.+)$/iu);
  const message = match?.[1]?.trim() ?? '';
  const head = normalize(message ? question.slice(0, question.length - message.length) : question);
  const audience = /\b(parents?|abhibhavak|guardians?)\b/.test(head) ? 'PARENTS'
    : /\b(students?|bachchon|bacchon|bachcho|baccho|vidyarthi)\b/.test(head) ? 'STUDENTS'
      : /\b(staff|teachers?|shikshak|karmchari)\b/.test(head) ? 'STAFF' : 'EVERYONE';
  return { message, audience, className: classIn(head) };
}

function paymentMethod(q: string) {
  if (/\bupi|gpay|phonepe|paytm\b/.test(q)) return 'UPI';
  if (/\b(cheque|check)\b/.test(q)) return 'CHEQUE';
  if (/\bcard\b/.test(q)) return 'CARD';
  return 'CASH';
}

/** The tool for a question, or null when it is not a data question we recognise. */
export function detectIntent(question: string, allowed: string[]): Intent | null {
  const q = normalize(question);
  const has = (key: keyof typeof KEYWORDS) => KEYWORDS[key].test(q);
  const pick = (tool: string, args: Record<string, unknown> = {}): Intent => ({ tool, args });

  // actions (prepared, then confirmed by the person) — the notice text may contain any word, so first
  if (NOTICE_WORD.test(q) && SEND_WORD.test(q)) return pick('send_notice', noticeParts(question));
  if (has('leave') && /\b(approve|manjoor|manzoor|sweekar|accept|reject|naamanjoor|namanjoor|asweekar|mana kar)\b/.test(q)) {
    return pick('leave_decision', { name: nameIn(question), decision: /\b(reject|naamanjoor|namanjoor|asweekar|mana kar)\b/.test(q) ? 'REJECTED' : 'APPROVED' });
  }
  if (has('fees') && /\b(jama karo|jama kar do|jama kar lo|jama kijiye|collect karo|collect kar lo|receive karo|record karo|le lo|payment lo|pay karo)\b/.test(q)) {
    return pick('collect_fee', { name: nameIn(question), method: paymentMethod(q) });
  }

  // "marks page kholo" asks to open a page, not for someone's marks — leave it to page navigation
  if (/\b(page|screen|section|tab|menu)\b/.test(q) || /\b(kholo|khol|kholiye|open|navigate|go to|jao|le chalo)\b/.test(q)) return null;
  const name = nameIn(question);
  const className = classIn(question);

  if (/\b(good morning|suprabhat|briefing|aaj ka (summary|update|haal|report|plan)|din ka summary|aaj kya (hai|chal raha))\b/.test(q)) return pick('daily_briefing');
  if (/\b(timetable|time table|schedule|routine|period|periods)\b/.test(q) && !/\b(exam|pariksha|date ?sheet)\b/.test(q)) return pick('timetable', { className, date: dateIn(question) });
  if (/\b(homework|home work|assignments?|grih ?karya)\b/.test(q)) return pick('homework', { className });
  if (/\b(date ?sheet|exam|exams|pariksha|paper)\b/.test(q) && /\b(kab|date|schedule|upcoming|aane wal\w*|agl\w|next|shuru|hone wal\w*|sheet|kal|aaj|parso|kaunsa|kaunsi|konsa|konsi)\b/.test(q) && !/\b(marks?|result|number aaye|kitne number|fail|pass)\b/.test(q)) {
    // "kal / aaj / parso / monday ko kaunsa exam" asks about that one day
    const namedDay = /\b(aaj|kal|parso|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar)\b/.test(q);
    return pick('exam_schedule', { className, ...(namedDay ? { date: dateIn(question) } : {}) });
  }
  if (has('attendance') && /\b(sabse (kam|zyada|jyada|achhi|acchi|kharab|buri|kharaab)|ranking|compare|kis class (ki|mein))\b/.test(q)) return pick('attendance_ranking');
  if (/\b(fail|failed|kamzor|weak|kam marks|pass nahi)\b/.test(q)) return pick('failing_students', { className });
  if (/\b(bus|van|transport|route|pickup|driver|gaadi)\b/.test(q)) return pick('transport', { name });
  if (/\b(holidays?|vacation|chhuttiyan|chuttiyan|school band|agli (chhutti|chutti)|next holiday|chhutti kab|chutti kab)\b/.test(q) && !/\b(kaun|staff|teacher|leave|pe hai|par hai)\b/.test(q)) return pick('holidays');
  if (/\b(salary|payslip|pay slip|tankhwah|vetan)\b/.test(q)) return pick('my_payslip');
  if (NOTICE_WORD.test(q) || /\bnotices\b/.test(q)) {
    // "fees wala notice" — keep topic words like "fees", drop only the asking words
    const query = q.split(' ').filter((w) => w.length > 2 && !NOTICE_STOP.has(w)).slice(0, 4).join(' ');
    return pick('notices', { query });
  }
  if (/\b(school ka|school ki|school ke)\b/.test(q) && /\b(number|phone|address|email|timing|timings|time|contact|website)\b/.test(q)) return pick('school_info');

  if (has('library') && (has('libraryLate') || !name)) return pick('library_overdue');
  if (has('stock')) return pick('low_stock');
  if (has('leave') && (has('staff') || !name || /\baaj\b|\bkaun\b/.test(q))) return pick('staff_leaves');
  // "class 10 mein kitne bache hain", "10 A ki strength", "kitne ladke / ladkiyan"
  const COUNT = /\bkitne\s+(bache|bachhe|bachche|bacche|bachey|bachcha|baccha|bacha|students?|vidyarthi|ladke|ladkiyan|ladkiya|log)\b|\b(strength|class size|students ki (ginti|sankhya)|bacchon ki (ginti|sankhya)|kitni (strength|sankhya))\b/;
  if (COUNT.test(q) && !has('attendance') && !has('fees') && (className || !/\b(staff|teachers?)\b/.test(q))) {
    if (allowed.includes('class_strength')) return pick('class_strength', { className });
    return pick('school_summary');
  }
  if (has('summary') && !has('fees')) return pick('school_summary');

  // "Riya Sharma ka number do" — a phone number, not marks
  if (/\bnumber\b/.test(q) && !/\b(kitne number|number aaye|number mile|roll number|admission number)\b/.test(q) && !has('fees')) return pick('find_student', { name });
  if (has('fees')) {
    if (has('defaulters') && (!name || /sabse|defaulter|kaun kaun|kiski|kiske/.test(q))) return pick('fee_defaulters', { className });
    if (!name && className && allowed.includes('fee_defaulters')) return pick('fee_defaulters', { className });
    return pick('student_fees', { name });
  }
  if (has('marks') && !has('contact')) return pick('student_marks', { name });
  if (has('attendance')) {
    if (className && (!name || /\bkaun\b|\bkis\b/.test(q))) return pick('class_attendance', { className });
    return pick('student_attendance', { name });
  }
  if (has('staff') && name) return pick('find_staff', { name });
  if (has('contact')) return pick('find_student', { name });
  return null;
}

// ── replies written from the data ──────────────────────────────────────────

const inr = (n: unknown) => `₹${Math.round(Number(n ?? 0)).toLocaleString('en-IN')}`;
const list = (items: unknown[], max = 6) => {
  const names = items.filter(Boolean).map(String);
  return names.length > max ? `${names.slice(0, max).join(', ')} aur ${names.length - max} aur` : names.join(', ');
};
type Any = Record<string, any>;

/** A Hinglish reply for a tool's result, or null to let the model phrase it. */
export function formatAnswer(tool: string, data: unknown): string | null {
  const d = (data ?? {}) as Any;
  if (typeof d.error === 'string') {
    return d.matches?.length ? `${d.error} Mile: ${list(d.matches)}.` : d.error;
  }
  switch (tool) {
    case 'school_summary': {
      const att = typeof d.todayAttendance === 'string'
        ? `Aaj ki attendance abhi nahi li gayi.`
        : `Aaj ${d.todayAttendance.present}/${d.todayAttendance.marked} students present hain (${d.todayAttendance.percent}%), ${d.todayAttendance.absent} absent.`;
      return `${list(d.schools)} (${d.academicYear}): ${d.activeStudents} active students, ${d.staff} staff (${d.teachers} teachers). ${att} `
        + `Fees: aaj tak due ${inr(d.fees.dueTillToday)} mein se ${inr(d.fees.collected)} aaya (${d.fees.collectionPercent ?? 0}%), ${inr(d.fees.overdue)} overdue hai.`;
    }
    case 'find_student': {
      const s: Any[] = d.students ?? [];
      if (!s.length) return 'Is naam ka koi student nahi mila.';
      return s.slice(0, 3).map((x) => {
        const g = (x.guardians as Any[]).map((p) => `${p.relation === 'FATHER' ? 'Papa' : p.relation === 'MOTHER' ? 'Mummy' : 'Guardian'} ${p.name} — ${p.phone}`).join('; ');
        return `${x.name} (${x.class ?? 'class nahi'}, roll ${x.rollNo ?? '-'}, adm ${x.admissionNo})${g ? `: ${g}` : ' — parents ka naam/number record mein nahi hai'}.`;
      }).join(' ') + (s.length > 3 ? ` Aur ${s.length - 3} students isi naam se mile.` : '');
    }
    case 'student_fees': {
      if (typeof d.fees === 'string') return `${d.student}: ${d.fees}.`;
      const next = d.nextInstallment ? ` Agli kisht ${d.nextInstallment.name}: ${inr(d.nextInstallment.amount)}, ${d.nextInstallment.dueDate} tak.` : '';
      const last = d.lastPayment ? ` Aakhri payment ${inr(d.lastPayment.amount)} on ${d.lastPayment.date}.` : '';
      return `${d.student} (${d.class ?? '-'}): saal ki fees ${inr(d.annualFee)}${d.concessionPercent ? ` (${d.concessionPercent}% concession)` : ''}, jama ${inr(d.paid)}, baaki ${inr(d.balance)}. `
        + (d.overdueNow > 0 ? `Abhi ${inr(d.overdueNow)} overdue hai.` : 'Abhi koi overdue nahi hai.') + next + last;
    }
    case 'student_attendance':
      if (!d.daysMarked) return `${d.student}: pichhle ${d.lastDays} din mein koi attendance record nahi hai.`;
      return `${d.student} (${d.class ?? '-'}): pichhle ${d.lastDays} din mein ${d.daysMarked} din mein se ${d.present} present (${d.percent}%), ${d.absent} absent, ${d.leave} leave.`
        + (d.recentAbsentDates?.length ? ` Absent dates: ${list(d.recentAbsentDates, 5)}.` : '');
    case 'student_marks':
      if (typeof d.results === 'string') return `${d.student}: ${d.results}.`;
      return (d.exams as Any[]).map((e) => {
        const weak = (e.papers as Any[]).filter((p) => !p.passed).map((p) => p.subject);
        return `${d.student} — ${e.exam}: ${e.total} (${e.percent}%).${weak.length ? ` Fail/absent: ${list(weak)}.` : ''}`;
      }).join(' ');
    case 'class_attendance':
      return (d.classes as Any[]).map((c) => typeof c.attendance === 'string'
        ? `${c.class}: ${d.date} ko ${c.attendance}.`
        : `${c.class} (${d.date}): ${c.present}/${c.total} present, ${c.absent} absent${c.absentStudents?.length ? ` — ${list(c.absentStudents, 10)}` : ''}${c.leave ? `, ${c.leave} leave (${list(c.onLeave)})` : ''}.`).join(' ');
    case 'fee_defaulters':
      if (!d.totalDefaulters) return 'Kisi student ki fees overdue nahi hai.';
      return `${d.totalDefaulters} students ki fees overdue hai, kul ${inr(d.totalOverdue)}. Sabse zyada: ${(d.top as Any[]).slice(0, 5).map((r) => `${r.name} (${r.class}) ${inr(r.overdue)}`).join(', ')}.`;
    case 'find_staff': {
      const s: Any[] = d.staff ?? [];
      if (!s.length) return 'Is naam ka koi staff member nahi mila.';
      return s.slice(0, 3).map((x) => `${x.name} (${x.code}) — ${x.designation}${x.department ? `, ${x.department}` : ''}, status ${x.status}, phone ${x.phone ?? '-'}, is saal ${x.leaveDaysThisYear} din leave.`).join(' ');
    }
    case 'staff_leaves': {
      const on: Any[] = d.onLeaveToday ?? [];
      const pending: Any[] = d.pendingRequests ?? [];
      return (on.length ? `Aaj chhutti par: ${on.map((l) => `${l.name} (${l.type}, ${l.until} tak)`).join(', ')}.` : 'Aaj koi staff chhutti par nahi hai.')
        + (pending.length ? ` ${pending.length} leave request approval ke liye pending: ${list(pending.map((l) => l.name))}.` : ' Koi leave request pending nahi hai.');
    }
    case 'low_stock':
      if (!d.lowStock) return `Sab ${d.totalItems} items minimum stock se upar hain.`;
      return `${d.lowStock} items minimum se kam hain: ${(d.items as Any[]).slice(0, 8).map((i) => `${i.name} (${i.have}, min ${i.minimum})`).join(', ')}.`;
    case 'library_overdue': {
      const o: Any[] = d.overdue ?? [];
      if (!o.length) return 'Koi book overdue nahi hai.';
      return `${o.length}${o.length >= 15 ? '+' : ''} books late hain: ${o.slice(0, 6).map((l) => `“${l.book}” — ${l.borrower} (${l.daysLate} din late)`).join(', ')}.`;
    }
    case 'timetable': {
      if (d.mine) {
        const periods: Any[] = d.periods ?? [];
        return periods.length
          ? `Aapka ${d.day} (${d.date}) ka timetable: ${periods.map((p) => `P${p.period} ${p.time} ${p.class} ${p.subject}`).join('; ')}.`
          : `${d.day} (${d.date}) ko aapka koi period nahi hai.`;
      }
      return (d.classes as Any[]).map((c) => (c.periods as Any[]).length
        ? `${c.class} — ${d.day}: ${(c.periods as Any[]).map((p) => `P${p.period} ${p.time} ${p.subject}${p.teacher ? ` (${p.teacher})` : ''}`).join('; ')}.`
        : `${c.class}: ${d.day} ko koi period nahi hai.`).join(' ') || 'Class batayein, jaise “10 A ka timetable”.';
    }
    case 'homework': {
      const h: Any[] = d.homework ?? [];
      if (!h.length) return 'Agle 7 din mein koi homework due nahi hai.';
      return `Agle 7 din ka homework: ${h.slice(0, 8).map((x) => `${x.class} ${x.subject} — “${x.title}”, ${x.due} tak`).join('; ')}.`;
    }
    case 'exam_schedule': {
      const p: Any[] = d.papers ?? [];
      const paper = (x: Any) => `${x.subject} (${x.exam}, ${x.time}${x.classes ? `, ${x.classes}` : ''})`;
      if (d.day) {
        if (p.length) return `${d.day} ko exam: ${p.map(paper).join('; ')}.`;
        return `${d.day} ko koi exam nahi hai.${d.next ? ` Agla exam: ${d.next.date} ${paper(d.next)}.` : ''}`;
      }
      if (!p.length) return `${d.for === 'all classes' ? '' : `${d.for}: `}abhi koi aane wala exam nahi hai.`;
      return `Aane wale exams (${d.for}): ${p.slice(0, 8).map((x) => `${x.date} ${x.subject} (${x.exam}, ${x.time}${x.classes ? `, ${x.classes}` : ''})`).join('; ')}.`;
    }
    case 'transport':
      if (typeof d.transport === 'string') return `${d.student}: ${d.transport}.`;
      return `${d.student} (${d.class ?? '-'}): route ${d.route ?? '-'}, stop ${d.stop ?? '-'}, pickup ${d.pickupTime ?? '-'}${d.vehicle ? `, gaadi ${d.vehicle}` : ''}${d.driver ? `, driver ${d.driver}` : ''}.`;
    case 'holidays': {
      const h: Any[] = d.holidays ?? [];
      if (!h.length) return 'Agle 90 din mein koi chhutti calendar mein nahi hai.';
      return `Aane wali chhuttiyan: ${h.slice(0, 6).map((x) => `${x.name} (${x.from === x.to ? x.from : `${x.from} se ${x.to}`})`).join('; ')}.`;
    }
    case 'notices': {
      const n: Any[] = d.notices ?? [];
      if (!n.length) return d.query ? `“${d.query}” se juda koi notice nahi mila.` : 'Notice board par koi notice nahi hai.';
      return `${d.query ? `“${d.query}” wale notices` : 'Haal ke notices'}: ${n.slice(0, 3).map((x) => `${x.date} — ${x.title}: ${x.text}`).join(' | ')}`;
    }
    case 'my_payslip':
      return `Aapki ${d.month} ki salary: gross ${inr(d.gross)}, katauti ${inr(d.deductions)}, haath mein ${inr(d.net)} (${d.status === 'PAID' ? `${d.paidOn ?? ''} ko paid` : 'abhi pay nahi hui'}).`;
    case 'school_info': {
      const extra = Object.entries(d).filter(([k]) => !['school', 'phone', 'email'].includes(k)).slice(0, 5).map(([k, v]) => `${k}: ${v}`);
      return `${d.school} — phone ${d.phone}, email ${d.email}${extra.length ? `; ${extra.join('; ')}` : ''}.`;
    }
    case 'daily_briefing':
      return briefingText(d);
    case 'attendance_ranking': {
      const c: Any[] = d.classes ?? [];
      if (!c.length) return 'Pichhle 30 din mein kisi class ki attendance record nahi hui.';
      const low = c.slice(0, 3).map((x) => `${x.class} ${x.percent}%`).join(', ');
      const high = [...c].reverse().slice(0, 2).map((x) => `${x.class} ${x.percent}%`).join(', ');
      return `Pichhle 30 din mein sabse kam attendance: ${low}. Sabse achhi: ${high}.`;
    }
    case 'class_strength': {
      const rows: Any[] = d.sections ?? [];
      const split = (r: Any) => (r.boys || r.girls ? ` (${r.boys} ladke, ${r.girls} ladkiyan)` : '');
      if (d.for === 'school') {
        const byGrade = new Map<string, number>();
        for (const r of rows) byGrade.set(r.grade, (byGrade.get(r.grade) ?? 0) + r.total);
        return `School mein kul ${d.total} bachche hain${split(d)}. Class-wise: ${[...byGrade.entries()].map(([g, n]) => `${g} — ${n}`).join(', ')}.`;
      }
      if (rows.length === 1) return `${rows[0].class} mein ${rows[0].total} bachche hain${split(rows[0])}.`;
      return `${d.for} mein kul ${d.total} bachche hain${split(d)}: ${rows.map((r) => `${r.class} — ${r.total}`).join(', ')}.`;
    }
    case 'failing_students': {
      const st: Any[] = d.students ?? [];
      if (!st.length) return `${d.exam}${d.class ? ` (${d.class})` : ''} mein koi bachcha fail nahi hai.`;
      return `${d.exam}${d.class ? ` (${d.class})` : ''} mein ${d.totalFailing} bachche kisi subject mein fail / absent: ${st.slice(0, 8).map((x) => `${x.name} (${x.class ?? '-'}: ${list(x.subjects, 3)})`).join(', ')}.`;
    }
    case 'leave_decision':
    case 'send_notice':
    case 'collect_fee':
      return d.action ? `${d.action.title} ${d.action.summary}` : null;
    default:
      return null;
  }
}

function briefingText(d: Any): string {
  const first = String(d.name ?? '').replace(/^(Dr|Mr|Mrs|Ms|Shri)\.?\s+/, '').split(/\s+/)[0];
  const hello = `Good morning${first ? ` ${first}` : ''}!`;
  const holiday = d.nextHoliday ? ` Agli chhutti: ${d.nextHoliday.name} (${d.nextHoliday.from}).` : '';
  if (d.kind === 'office') {
    const s = d.summary ?? {};
    const att = typeof s.todayAttendance === 'string' ? 'Aaj ki student attendance abhi shuru nahi hui.' : `Aaj ${s.todayAttendance.percent}% students present.`;
    const missing = d.attendanceMissing?.length ? ` ${d.attendanceMissing.length}/${d.totalClasses} classes ki attendance baaki: ${list(d.attendanceMissing, 5)}.` : ' Sab classes ki attendance ho gayi.';
    const leaves = d.leaves ? ` ${d.leaves.onLeaveToday.length} staff aaj chhutti par${d.leaves.pendingRequests.length ? `, ${d.leaves.pendingRequests.length} leave request pending` : ''}.` : '';
    const fees = s.fees ? ` Fees overdue: ${inr(s.fees.overdue)} (collection ${s.fees.collectionPercent ?? 0}%).` : '';
    const stock = d.lowStock ? ` ${d.lowStock} store items minimum se kam.` : '';
    return `${hello} ${att}${missing}${leaves}${fees}${stock}${holiday}`;
  }
  if (d.kind === 'teacher') {
    const tt = d.timetable?.periods ?? [];
    const periods = tt.length ? `Aaj aapke ${tt.length} period: ${tt.map((p: Any) => `${p.time} ${p.class} ${p.subject}`).join('; ')}.` : 'Aaj aapka koi period nahi hai.';
    const mine = d.myClassAttendance
      ? d.myClassAttendance.taken ? ` ${d.myClassAttendance.class}: ${d.myClassAttendance.present} present, ${d.myClassAttendance.absent} absent.` : ` ${d.myClassAttendance.class} ki attendance abhi leni hai.`
      : '';
    const hw = d.homework?.length ? ` ${d.homework.length} homework is hafte due.` : '';
    return `${hello} ${periods}${mine}${hw}${holiday}`;
  }
  if (d.kind === 'family') {
    const kids = (d.children as Any[]).map((c) => {
      const att = c.todayAttendance ? `aaj ${String(c.todayAttendance).toLowerCase()}` : 'aaj ki attendance abhi nahi lagi';
      const fee = c.overdue > 0 ? `, ${inr(c.overdue)} fees overdue` : c.nextInstallment ? `, agli fees ${inr(c.nextInstallment.amount)} ${c.nextInstallment.dueDate} tak` : '';
      return `${c.name} (${c.class ?? '-'}): ${att}${fee}.`;
    }).join(' ');
    const hw = d.homework?.length ? ` Homework: ${d.homework.slice(0, 3).map((h: Any) => `${h.subject} — ${h.title} (${h.due})`).join('; ')}.` : '';
    const exam = d.nextExam ? ` Agla exam: ${d.nextExam.subject} ${d.nextExam.date}.` : '';
    return `${hello} ${kids}${hw}${exam}${holiday}`;
  }
  return `${hello}${holiday}`;
}

// ── conversation: asking back, remembering the open question and the topic ──────

/** What a conversation is about, so "aur Riya ki?" or "10 B ki dikhao" can be finished later. */
export type Topic = 'attendance' | 'fees' | 'marks' | 'contact' | 'staff';

const TOPIC_OF: Record<string, Topic> = {
  class_attendance: 'attendance', student_attendance: 'attendance',
  student_fees: 'fees', fee_defaulters: 'fees',
  student_marks: 'marks', find_student: 'contact', find_staff: 'staff',
};

/** Saved with Jarvis's question in memory (AssistantMessage.source), e.g. "ask:attendance". */
export const ASK_PREFIX = 'ask:';

/** "student add karo", "book issue kar do", "marks update karo" — asking for a change. */
export const CHANGE_WORDS = /\b(karo|kar do|kar dijiye|kariye|bana do|banao|add karo|add kar do|jodo|jod do|delete|hatao|hata do|update karo|badlo|badal do|issue karo|issue kar do|save karo|mark karo|lagao|laga do|cancel karo|create karo|edit karo)\b/i;
/** Changes Jarvis prepares itself (with a confirm card). */
const ACTION_TOOLS = new Set(['leave_decision', 'send_notice', 'collect_fee']);

const CANCEL = /^(chhodo|chodo|chhod do|chod do|rehne do|rahne do|cancel|kuch nahi|koi nahi|mat karo|bas|stop|nevermind|never mind)\b/;
const PRONOUN = /\b(uski|uska|uske|iski|iska|iske|unki|unka|unke|inki|inka|inke|usko|isko|unko|inko|usne|isne|unhone|inhone|use|ise|unhe|inhe)\b/;

function askText(topic: Topic, staffTools: string[], again: boolean) {
  const lead = again ? 'Samajh nahi aaya. ' : '';
  switch (topic) {
    case 'attendance':
      return `${lead}Kaunsi class ki attendance dekhni hai? Jaise “10 A”. Kisi ek student ki chahiye to uska naam batayein.`;
    case 'fees':
      return staffTools.includes('fee_defaulters')
        ? `${lead}Kis student ki fees dekhni hai? Naam batayein — ya class bolein (jaise “10 B”), us class mein kiski fees baaki hai wo bata dunga.`
        : `${lead}Kis student ki fees dekhni hai? Naam batayein.`;
    case 'marks':
      return `${lead}Kis student ke marks dekhne hain? Naam batayein.`;
    case 'contact':
      return `${lead}Kis student ki details chahiye? Naam batayein.`;
    case 'staff':
      return `${lead}Kis staff member ki details chahiye? Naam batayein.`;
  }
}

/** The tool for a topic once we know the class or the person. */
function resolveTopic(topic: Topic, name: string, className: string | null, allowed: string[]): Intent | null {
  switch (topic) {
    case 'attendance':
      if (className && !name) return { tool: 'class_attendance', args: { className } };
      return name ? { tool: 'student_attendance', args: { name } } : null;
    case 'fees':
      if (className && !name && allowed.includes('fee_defaulters')) return { tool: 'fee_defaulters', args: { className } };
      return name ? { tool: 'student_fees', args: { name } } : null;
    case 'marks':
      return name ? { tool: 'student_marks', args: { name } } : null;
    case 'contact':
      return name ? { tool: 'find_student', args: { name } } : null;
    case 'staff':
      return name ? { tool: 'find_staff', args: { name } } : null;
  }
}

/** Does this answer still lack the class / person it needs (and is this user someone who must say which)? */
function missingTopic(intent: Intent, staffTools: string[]): Topic | null {
  const topic = TOPIC_OF[intent.tool];
  if (!topic) return null;
  const perStudent = ['student_attendance', 'student_fees', 'student_marks', 'find_student'].includes(intent.tool);
  // parents and students: no name means their own child, so nothing to ask
  if (perStudent && !intent.args.name && staffTools.includes(intent.tool)) return topic;
  if (intent.tool === 'find_staff' && !intent.args.name) return topic;
  return null;
}

export type Turn =
  | { kind: 'run'; tool: string; args: Record<string, unknown> }
  | { kind: 'ask'; text: string; topic: Topic }
  | { kind: 'cancel'; text: string }
  | { kind: 'remember'; key: string; value: string; text: string }
  | { kind: 'forget'; text: string }
  | { kind: 'recall' }
  | { kind: 'chat'; text: string }
  | { kind: 'multi'; steps: Intent[] }
  | null;

/** Greetings, thanks, "who are you", "what can you do" — answered at once, without the AI model. */
function smallTalk(q: string, allowed: string[], who: string): string | null {
  const name = who.replace(/^(dr|mr|mrs|ms|shri|smt)\.?\s+/i, '').split(/\s+/)[0] ?? '';
  const hi = name ? ` ${name}` : '';
  if (/^(hi+|hello|helo|hey|namaste|namaskar|pranam|good (afternoon|evening))( jarvis)?$/.test(q)) {
    return `Namaste${hi}! Boliye, kya dekhna hai? Jaise “aaj ka briefing”, “Aakash ki fees” ya “10 A ka timetable”.`;
  }
  if (/\b(kaise ho|kaise hain|kaisi ho|kaisa hai|kya haal|how are you|sab theek)\b/.test(q) && q.split(' ').length <= 6) {
    return `Main bilkul theek hoon, shukriya${hi}! Aap boliye, kya madad karun?`;
  }
  if (/\b(tum kaun|aap kaun|kaun ho|who are you|tumhara naam|aapka naam|apna naam)\b/.test(q)) {
    return 'Main Jarvis hoon — is school ERP ka assistant. Aap bolkar ya likhkar school ka data poochh sakte hain, aur kuch kaam confirm karke karwa sakte hain.';
  }
  if (/\b(kya kya kar|kya kar sakte|kya kar sakti|what can you do|help|madad kaise|kya poochh sakt|kya puch sakt)\b/.test(q)) {
    const can: string[] = [];
    if (allowed.includes('student_fees')) can.push('kisi bachche ki fees, attendance, marks aur parents ka number');
    if (allowed.includes('class_attendance')) can.push('class mein aaj kaun absent hai, kis class ki attendance sabse kam hai');
    if (allowed.includes('fee_defaulters')) can.push('kiski fees baaki hai');
    if (allowed.includes('failing_students')) can.push('kaun se bacche fail hain');
    if (allowed.includes('timetable')) can.push('timetable, homework, exam date sheet, chhuttiyan aur notices');
    if (allowed.includes('daily_briefing')) can.push('“good morning” bolne par aaj ka briefing');
    if (allowed.includes('leave_decision')) can.push('leave approve / reject');
    if (allowed.includes('send_notice')) can.push('notice bhejna');
    if (allowed.includes('collect_fee')) can.push('fees jama karna');
    can.push('“yaad rakho …” se baatein yaad rakhna');
    return `Main ye kar sakta hoon: ${can.join('; ')}. Kaam wali cheezein confirm karne ke baad hi hoti hain.`;
  }
  if (/^(thank you|thanks|thank u|thx|shukriya|dhanyavaad|dhanyawad|bahut (accha|badhiya))( jarvis| ji)?$/.test(q)) return 'Aapka swagat hai! Aur kuch chahiye to boliye.';
  if (/^(ok |okay |chalo )?(bye|alvida|tata|good night|see you)( jarvis)?$/.test(q)) return 'Theek hai, phir milte hain! Zaroorat ho to “Hey Jarvis” boliye.';
  if (/^(ok|okay|theek hai|thik hai|accha|achha|hmm+|samajh gaya|samajh gayi|got it)$/.test(q)) return 'Theek hai. Aur kuch?';
  return null;
}

const OVERVIEW = /\b(ke baare mein|ke bare me|ke baare me|ki details|ka profile|ki profile|sab kuch|poori jaankari|puri jankari|full details|report card)\b/;
const PERSON_TOPICS: [RegExp, string][] = [
  [/\b(fees?|baaki|jama|di ya nahi|bhari)\b/, 'student_fees'],
  [/\b(attendance|hazri|haziri|absent|present)\b/, 'student_attendance'],
  [/\b(marks?|result|number aaye|kitne number)\b/, 'student_marks'],
  [/\b(phone|mobile|contact|papa|mummy|parents?|number do)\b/, 'find_student'],
  [/\b(bus|van|transport|pickup)\b/, 'transport'],
];

/** "uski fees aur attendance dono", "Aakash ke baare mein batao" → several answers about one person. */
function personQuestions(q: string, person: string, allowed: string[]): Intent[] | null {
  if (!person || /\b(sir|madam|maam|teacher|staff)\b/.test(q)) return null;
  const tools = OVERVIEW.test(q)
    ? ['find_student', 'student_fees', 'student_attendance', 'student_marks']
    : PERSON_TOPICS.filter(([pattern]) => pattern.test(q)).map(([, tool]) => tool);
  const usable = tools.filter((tool) => allowed.includes(tool));
  return usable.length >= 2 || (OVERVIEW.test(q) && usable.length) ? usable.map((tool) => ({ tool, args: { name: person } })) : null;
}

/** Saved with a reply that matched several people ("pick:student_fees|CASH"), so "10 B wali" can choose. */
export const PICK_PREFIX = 'pick:';

/**
 * Decides what to do with a message, given what Jarvis said last:
 *   lastSource — the source saved with Jarvis's previous reply: a data tool ("student_fees") or an open
 *                question ("ask:fees"); lastName — the person talked about in the recent turns.
 * Returns null when it is not a data conversation (the AI model handles it).
 */
export function planTurn(asked: string, allowed: string[], staffTools: string[], lastSource: string | null, lastName: string, myClass: string | null = null, names: Set<string> | null = null, who = ''): Turn {
  activeNames = names;
  try {
    return decideTurn(asked, allowed, staffTools, lastSource, lastName, myClass, who);
  } finally {
    activeNames = null;
  }
}

function decideTurn(asked: string, allowed: string[], staffTools: string[], lastSource: string | null, lastName: string, myClass: string | null, who: string): Turn {
  // "meri class" → the class the person told Jarvis to remember, or the one they are class teacher of
  const question = myClass ? asked.replace(/\b(meri|mere|mera|hamari|hamare|apni|apne|my)\s+class\b/giu, `class ${myClass}`) : asked;
  const q = normalize(question);

  // ── long-term memory: "yaad rakho …", "bhool jao", "kya yaad hai?" ──
  const remember = question.match(/\b(?:yaad rakho|yad rakho|yaad rakhna|yaad kar lo|remember)\b\s*(?:ki|that)?\s*(.*)$/iu);
  if (remember) {
    const fact = remember[1].trim().replace(/[.!?]+$/, '');
    const factClass = classIn(fact);
    if (factClass && /\bclass\b/.test(normalize(fact)) && /\b(meri|mera|mere|my|hamari|apni)\b/.test(normalize(fact))) {
      return { kind: 'remember', key: 'myClass', value: factClass, text: `Theek hai, yaad rakh liya: aapki class ${factClass} hai. Ab “meri class ki attendance” ya “meri class ka timetable” bol sakte hain.` };
    }
    if (fact.length < 3) return { kind: 'cancel', text: 'Kya yaad rakhna hai? Jaise “yaad rakho meri class 10 B hai”.' };
    return { kind: 'remember', key: 'note', value: fact.slice(0, 480), text: `Theek hai, yaad rakh liya: “${fact}”.` };
  }
  if (/\b(bhool jao|bhul jao|bhula do|forget)\b/.test(q)) return { kind: 'forget', text: 'Theek hai, jo yaad rakhne ko kaha tha wo sab bhool gaya.' };
  if (/\b(kya yaad hai|kya kya yaad|yaad kya hai|what do you remember)\b/.test(q)) return { kind: 'recall' };

  const pending = lastSource?.startsWith(ASK_PREFIX) ? (lastSource.slice(ASK_PREFIX.length) as Topic) : null;
  const picking = lastSource?.startsWith(PICK_PREFIX) ? lastSource.slice(PICK_PREFIX.length) : null;
  const lastTopic = pending ?? (lastSource ? TOPIC_OF[lastSource] ?? null : null);

  if ((pending || picking) && CANCEL.test(q)) return { kind: 'cancel', text: 'Theek hai, chhod diya. Aur kuch poochhna ho to boliye.' };

  const chat = smallTalk(q, allowed, who);
  if (chat) return { kind: 'chat', text: chat };

  // several things about one person at once
  const person = nameIn(question) || (PRONOUN.test(q) ? lastName : '');
  const several = personQuestions(q, person, allowed);
  if (several) return { kind: 'multi', steps: several };

  // several people matched last time: "10 B wali" / "Riya Sharma" picks one
  if (picking) {
    const [tool, extra] = picking.split('|');
    const pickedClass = classIn(question);
    const pickedName = nameIn(question);
    const fresh = detectIntent(question, allowed);
    // a new question of another kind is not a pick
    if (q.split(' ').length <= 6 && (pickedClass || pickedName) && (!fresh || fresh.tool === tool)) {
      const args: Record<string, unknown> = { name: pickedName || lastName, ...(pickedClass ? { className: pickedClass } : {}) };
      if (extra && tool === 'collect_fee') args.method = extra;
      if (extra && tool === 'leave_decision') args.decision = extra;
      return { kind: 'run', tool, args };
    }
  }

  // "marks page kholo" — opening a page, even in the middle of a conversation: the model handles it
  if (!(NOTICE_WORD.test(q) && SEND_WORD.test(q)) && /\b(page|screen|menu|kholo|khol|kholiye|open|navigate|le chalo)\b/.test(q)) return null;

  // a named ERP list ("visitors", "admission enquiries", "vendors", "audit log") — read it rather than
  // guessing a student question from a stray word like "aaye" or "admission"
  const list = matchList(question);
  const change = CHANGE_WORDS.test(q);

  const intent = detectIntent(question, allowed);
  if (intent) {
    // "book issue kar do": a change — never answered with a read tool (the route offers the page)
    if (change && !ACTION_TOOLS.has(intent.tool)) return null;
    // "uski attendance?" — the person from the recent conversation
    if ('name' in intent.args && !intent.args.name && PRONOUN.test(q) && lastName) intent.args.name = lastName;
    const missing = missingTopic(intent, staffTools);
    if (missing === 'attendance' && myClass && !list) return { kind: 'run', tool: 'class_attendance', args: { className: myClass } };
    if (missing && list) return null;
    if (missing) return { kind: 'ask', text: askText(missing, staffTools, false), topic: missing };
    // a per-person question with no person, from staff, when a list was named: the list
    if (list && 'name' in intent.args && !intent.args.name && staffTools.includes(intent.tool)) return null;
    return { kind: 'run', ...intent };
  }

  if (change) return null;
  if (!lastTopic) return null;
  const words = q.split(' ').filter(Boolean);
  const name = nameIn(question) || (PRONOUN.test(q) ? lastName : '');
  const className = classIn(question);
  // a new question about an ERP list is not an answer to the earlier one
  if (list && !name && !className) return null;
  // an answer to Jarvis's question, or a short follow-up like "aur Riya ki?" / "10 B ki dikhao"
  if (pending || words.length <= 6) {
    const resolved = resolveTopic(lastTopic, name, className, allowed);
    if (resolved) return { kind: 'run', ...resolved };
  }
  // still not understood: ask once more if it was a short reply to our question; otherwise let the model try
  if (pending && words.length <= 6) return { kind: 'ask', text: askText(pending, staffTools, true), topic: pending };
  return null;
}
