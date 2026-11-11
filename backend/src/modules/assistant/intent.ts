/**
 * Picks the data tool for common questions without the AI model, and writes the reply from the data.
 * Small local models pick wrong tools and invent numbers; school data answers must be exact, so the
 * usual questions (fees, attendance, marks, phone numbers, who is absent, leave, stock, library,
 * school totals) are understood here and answered word for word from the database.
 */

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
the of for what is how much tell me show give a an and or in on with please
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

/** The words left once question words and the class are removed — the person's name, if any. */
export function nameIn(text: string): string {
  let t = normalize(text);
  const cls = t.match(/\b(?:class\s*)?(\d{1,2}|lkg|ukg|nursery)\s*[- ]?\s*([a-h])?\b/);
  if (cls) t = t.replace(cls[0], ' ');
  return t.split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).slice(0, 3).join(' ');
}

/** The tool for a question, or null when it is not a data question we recognise. */
export function detectIntent(question: string, allowed: string[]): Intent | null {
  const q = normalize(question);
  const has = (key: keyof typeof KEYWORDS) => KEYWORDS[key].test(q);
  const name = nameIn(question);
  const className = classIn(question);
  const pick = (tool: string, args: Record<string, unknown> = {}): Intent => ({ tool, args });

  if (has('library') && (has('libraryLate') || !name)) return pick('library_overdue');
  if (has('stock')) return pick('low_stock');
  if (has('leave') && (has('staff') || !name || /\baaj\b|\bkaun\b/.test(q))) return pick('staff_leaves');
  if (has('summary') && !has('fees')) return pick('school_summary');

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
    default:
      return null;
  }
}
