import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Briefcase, CalendarDays, CheckCircle2, Clock, Download, FileSearch, FileText, GraduationCap, IndianRupee, Loader2, Mail,
  MapPin, Megaphone, MessageCircle, Phone, Search, Send, Upload, Users, X,
} from "lucide-react";
import { usePublicNotices } from "@/store/communication";
import { examStatus } from "@/store/exams";
import { usePublicExams } from "@/store/publicSite";
import { isAcceptingApplications, submitApplication, useJobs, type JobOpening } from "@/store/recruitment";
import { registerAlumni, sendFeedback, useSite, type FeedbackKind } from "@/store/website";
import { holidaysForCurrentYear } from "@/data/calendar";
import { PageHero, SectionTitle, siteInput, sitePath } from "../SiteLayout";
import { ADMISSION_DOCUMENTS, AGE_CRITERIA, DOWNLOADS, NOTABLE_ALUMNI } from "../siteContent";
import { downloadFile, printableDoc, publicNotices, shortDate } from "../siteUtils";

const lbl = "mb-1.5 block text-sm font-medium text-slate-700";
const phoneOk = (p: string) => /^[+]?[0-9\s-]{10,15}$/.test(p.trim());
const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());
const Err = ({ msg }: { msg?: string }) => (msg ? <p className="mt-1 text-xs font-medium text-rose-600">{msg}</p> : null);

function Done({ title, children, onReset }: { title: string; children: ReactNode; onReset: () => void }) {
  return (
    <div className="rounded-2xl bg-emerald-50 p-8 text-center ring-1 ring-emerald-200">
      <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
      <p className="mt-3 font-display text-xl font-bold text-blue-950">{title}</p>
      <div className="mt-1 text-slate-600">{children}</div>
      <button type="button" onClick={onReset} className="mt-4 text-sm font-semibold text-blue-900 hover:text-amber-600">Send another</button>
    </div>
  );
}

// ── Notices & downloads ──────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, string> = {
  academic: "bg-sky-100 text-sky-800", fees: "bg-emerald-100 text-emerald-800", event: "bg-fuchsia-100 text-fuchsia-800", general: "bg-slate-100 text-slate-700",
};

function TcVerification() {
  const site = useSite();
  const [f, setF] = useState({ tcNo: "", studentName: "", year: "", requester: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!f.tcNo.trim()) e.tcNo = "Enter the TC number";
    if (f.studentName.trim().length < 2) e.studentName = "Enter the student's name";
    if (f.requester.trim().length < 2) e.requester = "Enter your name / institution";
    if (!phoneOk(f.phone)) e.phone = "Enter a valid phone number";
    setErrors(e);
    if (Object.keys(e).length) return;
    void sendFeedback({
      kind: "Contact", name: f.requester.trim(), phone: f.phone.trim(), email: "",
      subject: `TC verification: ${f.tcNo.trim()}`, message: `Student: ${f.studentName.trim()}${f.year ? `, year of leaving ${f.year}` : ""}. Please verify this transfer certificate.`,
    }).then((ok) => ok && setDone(true));
  }

  if (done) return <Done title="Verification request sent" onReset={() => { setDone(false); setF({ tcNo: "", studentName: "", year: "", requester: "", phone: "" }); }}>The school office will verify TC <b>{f.tcNo}</b> and call you on {f.phone} within two working days. You can also email {site.email}.</Done>;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <label><span className={lbl}>TC number *</span><input className={siteInput} value={f.tcNo} onChange={set("tcNo")} /><Err msg={errors.tcNo} /></label>
      <label><span className={lbl}>Student's name *</span><input className={siteInput} value={f.studentName} onChange={set("studentName")} /><Err msg={errors.studentName} /></label>
      <label><span className={lbl}>Year of leaving</span><input className={siteInput} value={f.year} onChange={set("year")} inputMode="numeric" /></label>
      <label><span className={lbl}>Your name / institution *</span><input className={siteInput} value={f.requester} onChange={set("requester")} /><Err msg={errors.requester} /></label>
      <label><span className={lbl}>Phone *</span><input className={siteInput} value={f.phone} onChange={set("phone")} inputMode="tel" /><Err msg={errors.phone} /></label>
      <div className="flex items-end"><button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-950 px-5 py-2.5 font-semibold text-white hover:bg-blue-900"><FileSearch className="size-4" />Request verification</button></div>
    </form>
  );
}

export function SiteNotices() {
  const site = useSite();
  const notices = publicNotices(usePublicNotices());
  const exams = usePublicExams().filter((e) => examStatus(e) !== "Completed");
  const holidays = holidaysForCurrentYear();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const shown = notices.filter((n) => (cat === "all" || n.category === cat) && (!q || `${n.title} ${n.content}`.toLowerCase().includes(q.toLowerCase())));

  function download(title: string) {
    const lines: Record<string, { heading: string; lines: string[] }[]> = {
      "Academic calendar": [{ heading: "Holidays & breaks", lines: holidays.map((h) => `${h.name}: ${shortDate(h.start)}${h.end !== h.start ? ` – ${shortDate(h.end)}` : ""}`) }],
      "Registration form": [{ heading: "Student details", lines: ["Name: ____________________", "Date of birth: __________", "Class applying for: ______", "Previous school: __________"] }, { heading: "Parent details", lines: ["Father's name & phone: ____________", "Mother's name & phone: ____________", "Address: ____________________"] }, { heading: "Documents to attach", lines: ADMISSION_DOCUMENTS }],
      Prospectus: [{ heading: "About", lines: site.about.split("\n").filter(Boolean) }, { heading: "Age criteria", lines: AGE_CRITERIA.map((a) => `${a.cls}: ${a.age}`) }],
    };
    downloadFile(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, printableDoc(title, site.name, lines[title] ?? [{ heading: title, lines: ["Please collect the latest copy from the school office or the parent app."] }]));
  }

  return (
    <>
      <PageHero title="Notices & Downloads" crumb="Notices" subtitle="Circulars, date sheets, holiday list and forms." />
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-blue-950"><Megaphone className="size-6 text-amber-500" />Circulars & notices</h2>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1"><span className="sr-only">Search notices</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className={`${siteInput} pl-10`} placeholder="Search notices" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <select className={`${siteInput} sm:w-44`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
                <option value="all">All categories</option><option value="academic">Academic</option><option value="event">Events</option><option value="fees">Fees</option><option value="general">General</option>
              </select>
            </div>
            <ul className="mt-6 space-y-3">
              {shown.map((n) => (
                <li key={n.id} className="rounded-2xl p-5 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-amber-700">{shortDate(n.date)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${CATEGORY_STYLE[n.category] ?? CATEGORY_STYLE.general}`}>{n.category}</span>
                    {n.priority === "high" && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">Important</span>}
                  </div>
                  <p className="mt-2 font-display text-lg font-semibold text-blue-950">{n.title}</p>
                  <p className="mt-1 whitespace-pre-line text-slate-600">{n.content}</p>
                  <p className="mt-2 text-xs text-slate-500">— {n.from}</p>
                </li>
              ))}
              {shown.length === 0 && <li className="rounded-2xl p-8 text-center text-slate-500 ring-1 ring-slate-200">No notices found.</li>}
            </ul>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-blue-950 p-6 text-white">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold"><CalendarDays className="size-5 text-amber-300" />Exam date sheets</h2>
              {exams.length === 0 && <p className="mt-3 text-sm text-blue-200">No upcoming exams.</p>}
              {exams.map((e) => (
                <details key={e.id} className="mt-4 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                  <summary className="cursor-pointer font-semibold">{e.name} <span className="text-sm font-normal text-blue-200">· Classes {e.grades.join(", ")}</span></summary>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {e.papers.map((p) => <li key={p.subject + p.date} className="flex justify-between gap-3"><span>{p.subject}</span><span className="text-blue-200">{shortDate(p.date)}</span></li>)}
                  </ul>
                  <p className="mt-2 text-xs text-blue-300">{e.papers[0]?.time}</p>
                </details>
              ))}
            </div>
            <div className="rounded-2xl p-6 ring-1 ring-slate-200">
              <h2 className="font-display text-xl font-bold text-blue-950">Holiday list</h2>
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {holidays.map((h) => (
                  <li key={h.name} className="flex justify-between gap-3 py-2"><span className="text-slate-700">{h.name}</span><span className="shrink-0 text-right font-medium text-blue-950">{shortDate(h.start)}{h.end !== h.start && <><br />– {shortDate(h.end)}</>}</span></li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Downloads" title="Forms & documents" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOWNLOADS.map((d) => (
              <button key={d.title} type="button" onClick={() => download(d.title)} className="flex items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-300">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><FileText className="size-6" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-blue-950">{d.title}</span><span className="block text-sm text-slate-500">{d.size}</span></span>
                <Download className="size-5 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="tc" className="scroll-mt-24 py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionTitle eyebrow="For schools & institutions" title="Transfer certificate verification" text="Submit the details of a TC issued by our school and the office will confirm whether it is genuine." />
          <div className="mt-8 rounded-2xl p-6 ring-1 ring-slate-200 sm:p-8"><TcVerification /></div>
        </div>
      </section>
    </>
  );
}

// ── Careers ──────────────────────────────────────────────────────────────────

const APPLY_EMPTY = { name: "", email: "", phone: "", qualification: "", experienceYears: "", currentEmployer: "", expectedSalary: "", coverLetter: "" };

function ApplyForm({ job, onClose }: { job: JobOpening | null; onClose: () => void }) {
  const [f, setF] = useState(APPLY_EMPTY);
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const set = (k: keyof typeof APPLY_EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter your full name";
    if (!emailOk(f.email)) e.email = "Enter a valid email";
    if (!phoneOk(f.phone)) e.phone = "Enter a valid mobile number";
    if (f.qualification.trim().length < 2) e.qualification = "Enter your qualifications";
    if (f.experienceYears === "" || Number(f.experienceYears) < 0 || Number(f.experienceYears) > 50) e.experienceYears = "Enter years of experience";
    if (!resume) e.resume = "Attach your resume";
    else if (!/\.(pdf|docx?)$/i.test(resume.name)) e.resume = "PDF or Word file only";
    else if (resume.size > 5 * 1024 * 1024) e.resume = "Maximum size is 5 MB";
    setErrors(e);
    if (Object.keys(e).length) return;
    setState("sending");
    void (async () => {
      const ok = await submitApplication({
        jobId: job?.id ?? null, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), qualification: f.qualification.trim(),
        experienceYears: Number(f.experienceYears), currentEmployer: f.currentEmployer.trim(), expectedSalary: f.expectedSalary.trim(),
        coverLetter: f.coverLetter.trim(), resumeName: resume!.name,
      });
      setState(ok ? "done" : "idle");
    })();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Job application">
      <div className="relative my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        {state === "done" ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
            <p className="mt-4 font-display text-2xl font-bold text-blue-950">Application submitted</p>
            <p className="mx-auto mt-2 max-w-md text-slate-600">Thank you, {f.name.split(" ")[0]}. Our HR team will review your application{job ? ` for ${job.title}` : ""} and contact shortlisted candidates by phone or email.</p>
            <button type="button" onClick={onClose} className="mt-6 rounded-xl bg-blue-950 px-6 py-3 font-semibold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">Apply</p>
            <h2 className="mt-1 pr-8 font-display text-2xl font-bold text-blue-950">{job ? job.title : "General application"}</h2>
            {job && <p className="text-sm text-slate-500">{job.department} · {job.campus}</p>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className={lbl}>Full name *</span><input className={siteInput} value={f.name} onChange={set("name")} autoComplete="name" /><Err msg={errors.name} /></label>
              <label><span className={lbl}>Email *</span><input type="email" className={siteInput} value={f.email} onChange={set("email")} autoComplete="email" /><Err msg={errors.email} /></label>
              <label><span className={lbl}>Mobile *</span><input className={siteInput} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" /><Err msg={errors.phone} /></label>
              <label><span className={lbl}>Experience (years) *</span><input type="number" min={0} max={50} className={siteInput} value={f.experienceYears} onChange={set("experienceYears")} /><Err msg={errors.experienceYears} /></label>
              <label className="sm:col-span-2"><span className={lbl}>Qualifications *</span><input className={siteInput} placeholder="e.g. M.Sc. Physics, B.Ed., CTET" value={f.qualification} onChange={set("qualification")} /><Err msg={errors.qualification} /></label>
              <label><span className={lbl}>Current / last employer</span><input className={siteInput} value={f.currentEmployer} onChange={set("currentEmployer")} /></label>
              <label><span className={lbl}>Expected salary</span><input className={siteInput} value={f.expectedSalary} onChange={set("expectedSalary")} /></label>
              <div className="sm:col-span-2">
                <span className={lbl}>Resume (PDF / Word, max 5 MB) *</span>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600 hover:border-blue-700">
                  <Upload className="size-5 text-blue-900" />
                  <span className="min-w-0 flex-1 truncate">{resume ? resume.name : "Choose file"}</span>
                  <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
                </label>
                <Err msg={errors.resume} />
              </div>
              <label className="sm:col-span-2"><span className={lbl}>Why would you like to join us?</span><textarea className={`${siteInput} min-h-24`} value={f.coverLetter} onChange={set("coverLetter")} /></label>
            </div>
            <button type="submit" disabled={state === "sending"} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-5 py-3.5 font-semibold text-white hover:bg-blue-900 disabled:opacity-70">
              {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Submit application
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function SiteCareers() {
  const site = useSite();
  const jobs = useJobs().filter(isAcceptingApplications);
  const [category, setCategory] = useState("All");
  const [applyFor, setApplyFor] = useState<JobOpening | null | undefined>(undefined);
  const categories = useMemo(() => ["All", ...Array.from(new Set(jobs.map((j) => j.category)))], [jobs]);
  const shown = category === "All" ? jobs : jobs.filter((j) => j.category === category);

  return (
    <>
      <PageHero title="Careers" subtitle={`Join a team that is shaping the next generation. ${site.name} is an equal-opportunity employer.`} />
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: GraduationCap, t: "Professional growth", d: "40+ hours of training every year and sponsored certifications." },
              { icon: IndianRupee, t: "Fair pay & benefits", d: "Competitive salary, PF, gratuity, medical insurance." },
              { icon: Users, t: "Supportive culture", d: "Mentoring, collaboration and respect for every staff member." },
              { icon: Briefcase, t: "Child fee concession", d: "50% tuition concession for staff children." },
            ].map((b) => (
              <div key={b.t} className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200"><b.icon className="size-7 text-amber-600" /><p className="mt-3 font-semibold text-blue-950">{b.t}</p><p className="mt-1 text-sm text-slate-600">{b.d}</p></div>
            ))}
          </div>

          <div className="mt-14 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionTitle eyebrow="Open positions" title={`${jobs.length} current opening${jobs.length === 1 ? "" : "s"}`} />
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full px-4 py-2 text-sm font-semibold ${category === c ? "bg-blue-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{c}</button>)}
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {shown.map((j) => (
              <details key={j.id} className="group rounded-2xl ring-1 ring-slate-200 open:ring-blue-300">
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-display text-xl font-semibold text-blue-950">{j.title}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5"><Briefcase className="size-4 text-amber-600" />{j.department} · {j.employmentType}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="size-4 text-amber-600" />{j.campus}</span>
                      <span className="flex items-center gap-1.5"><Users className="size-4 text-amber-600" />{j.vacancies} vacanc{j.vacancies === 1 ? "y" : "ies"}</span>
                      <span className="flex items-center gap-1.5"><Clock className="size-4 text-amber-600" />Apply by {shortDate(j.lastDate)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-blue-900 group-open:hidden">View details ↓</span>
                </summary>
                <div className="border-t border-slate-100 px-6 pb-6 pt-4">
                  <p className="text-slate-700">{j.description}</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Qualification</p><p className="mt-1 text-sm text-slate-800">{j.qualification}</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Experience</p><p className="mt-1 text-sm text-slate-800">{j.experience}</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Salary</p><p className="mt-1 text-sm text-slate-800">{j.salary}</p></div>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase text-slate-500">Responsibilities</p>
                  <ul className="mt-2 space-y-1.5">{j.responsibilities.map((r) => <li key={r} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />{r}</li>)}</ul>
                  <button type="button" onClick={() => setApplyFor(j)} className="mt-6 rounded-xl bg-amber-400 px-6 py-3 font-bold text-blue-950 hover:bg-amber-300">Apply for this position</button>
                </div>
              </details>
            ))}
            {shown.length === 0 && <p className="rounded-2xl p-8 text-center text-slate-500 ring-1 ring-slate-200">No openings in this category right now.</p>}
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-blue-950 p-8 text-white">
              <p className="font-display text-2xl font-bold">Don't see the right role?</p>
              <p className="mt-2 text-blue-200">Send us your resume. We'll contact you when a suitable position opens.</p>
              <button type="button" onClick={() => setApplyFor(null)} className="mt-5 rounded-xl bg-amber-400 px-6 py-3 font-bold text-blue-950 hover:bg-amber-300">Send general application</button>
            </div>
            <div className="rounded-2xl p-8 ring-1 ring-slate-200">
              <p className="font-display text-xl font-bold text-blue-950">Selection process</p>
              <ol className="mt-4 space-y-2 text-slate-700">
                {["Application screening", "Written test (for teaching posts)", "Demo class", "Interview with the Principal", "Offer & document verification"].map((s, i) => (
                  <li key={s} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">{i + 1}</span>{s}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
      {applyFor !== undefined && <ApplyForm job={applyFor} onClose={() => setApplyFor(undefined)} />}
    </>
  );
}

// ── Alumni ───────────────────────────────────────────────────────────────────

const ALUMNI_EMPTY = { name: "", batch: "", email: "", phone: "", occupation: "", city: "" };

export function SiteAlumni() {
  const site = useSite();
  const [f, setF] = useState(ALUMNI_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof ALUMNI_EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter your name";
    const year = Number(f.batch);
    if (!Number.isInteger(year) || year < site.established || year > new Date().getFullYear()) e.batch = `Year between ${site.established} and ${new Date().getFullYear()}`;
    if (!emailOk(f.email)) e.email = "Enter a valid email";
    setErrors(e);
    if (Object.keys(e).length) return;
    void registerAlumni({ ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), occupation: f.occupation.trim(), city: f.city.trim() }).then((ok) => ok && setDone(true));
  }

  return (
    <>
      <PageHero title="Alumni" subtitle="Once a Greenwoodian, always a Greenwoodian." />
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Making us proud" title="Notable alumni" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NOTABLE_ALUMNI.map((a) => (
              <div key={a.name} className="flex items-center gap-4 rounded-2xl p-5 ring-1 ring-slate-200">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-blue-950 font-display text-lg font-bold text-amber-300">{a.name.replace(/^(Dr\.|Capt\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <div><p className="font-semibold text-blue-950">{a.name}</p><p className="text-sm text-slate-600">{a.now}</p><p className="text-xs font-semibold text-amber-700">Batch of {a.batch}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow="Stay connected" title="Join the alumni network" text="Register to receive invitations to the annual alumni meet, mentor current students and reconnect with your batch." />
            <ul className="mt-6 space-y-2 text-slate-700">
              {["Annual alumni meet every December", "Mentor students in career sessions", "Alumni newsletter twice a year", "Exclusive campus visits"].map((p) => <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />{p}</li>)}
            </ul>
          </div>
          {done ? (
            <Done title={`Welcome back, ${f.name.split(" ")[0]}!`} onReset={() => { setDone(false); setF(ALUMNI_EMPTY); }}>You're registered with the batch of {f.batch}. We'll email you at {f.email}.</Done>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 sm:p-8">
              <label><span className={lbl}>Full name *</span><input className={siteInput} value={f.name} onChange={set("name")} /><Err msg={errors.name} /></label>
              <label><span className={lbl}>Year of passing (Class 12) *</span><input className={siteInput} value={f.batch} onChange={set("batch")} inputMode="numeric" /><Err msg={errors.batch} /></label>
              <label><span className={lbl}>Email *</span><input type="email" className={siteInput} value={f.email} onChange={set("email")} /><Err msg={errors.email} /></label>
              <label><span className={lbl}>Mobile</span><input className={siteInput} value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
              <label><span className={lbl}>Current occupation</span><input className={siteInput} value={f.occupation} onChange={set("occupation")} /></label>
              <label><span className={lbl}>City</span><input className={siteInput} value={f.city} onChange={set("city")} /></label>
              <button type="submit" className="rounded-xl bg-blue-950 px-5 py-3 font-semibold text-white hover:bg-blue-900 sm:col-span-2">Register</button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────

const CONTACT_EMPTY = { name: "", phone: "", email: "", subject: "", message: "" };

function MessageForm({ kind, button }: { kind: FeedbackKind; button: string }) {
  const [f, setF] = useState(CONTACT_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof CONTACT_EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter your name";
    if (!phoneOk(f.phone)) e.phone = "Enter a valid phone number";
    if (f.email && !emailOk(f.email)) e.email = "Enter a valid email";
    if (f.subject.trim().length < 3) e.subject = "Enter a subject";
    if (f.message.trim().length < 10) e.message = "Please write at least 10 characters";
    setErrors(e);
    if (Object.keys(e).length) return;
    void sendFeedback({ kind, name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), subject: f.subject.trim(), message: f.message.trim() }).then((ok) => ok && setDone(true));
  }

  if (done) return <Done title={kind === "Grievance" ? "Grievance registered" : "Message sent"} onReset={() => { setDone(false); setF(CONTACT_EMPTY); }}>{kind === "Grievance" ? "The grievance committee will respond within 7 working days." : "We'll get back to you within one working day."}</Done>;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <label><span className={lbl}>Name *</span><input className={siteInput} value={f.name} onChange={set("name")} autoComplete="name" /><Err msg={errors.name} /></label>
      <label><span className={lbl}>Phone *</span><input className={siteInput} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" /><Err msg={errors.phone} /></label>
      <label><span className={lbl}>Email</span><input type="email" className={siteInput} value={f.email} onChange={set("email")} autoComplete="email" /><Err msg={errors.email} /></label>
      <label><span className={lbl}>Subject *</span><input className={siteInput} value={f.subject} onChange={set("subject")} /><Err msg={errors.subject} /></label>
      <label className="sm:col-span-2"><span className={lbl}>Message *</span><textarea className={`${siteInput} min-h-28`} value={f.message} onChange={set("message")} /><Err msg={errors.message} /></label>
      <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-blue-950 px-5 py-3 font-semibold text-white hover:bg-blue-900 sm:col-span-2"><Send className="size-4" />{button}</button>
    </form>
  );
}

export function SiteContact() {
  const site = useSite();
  const mapQuery = encodeURIComponent(`${site.address}, ${site.city}, ${site.state} ${site.pincode}`);
  return (
    <>
      <PageHero title="Contact Us" subtitle="We're happy to help. Visit, call or write to us." />
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Phone, t: "Call us", d: site.phone, href: `tel:${site.phone.replace(/\s/g, "")}` },
              { icon: MessageCircle, t: "WhatsApp", d: site.whatsapp, href: `https://wa.me/${site.whatsapp.replace(/\D/g, "")}` },
              { icon: Mail, t: "Email", d: site.email, href: `mailto:${site.email}` },
              { icon: Clock, t: "Office hours", d: site.officeHours },
            ].map((c) => {
              const inner = (<><span className="grid size-12 place-items-center rounded-xl bg-amber-100 text-amber-700"><c.icon className="size-6" /></span><span className="mt-3 block font-semibold text-blue-950">{c.t}</span><span className="block break-words text-sm text-slate-600">{c.d}</span></>);
              return c.href
                ? <a key={c.t} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="rounded-2xl p-6 ring-1 ring-slate-200 transition hover:ring-blue-300">{inner}</a>
                : <div key={c.t} className="rounded-2xl p-6 ring-1 ring-slate-200">{inner}</div>;
            })}
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl p-6 ring-1 ring-slate-200 sm:p-8">
              <h2 className="font-display text-2xl font-bold text-blue-950">Send us a message</h2>
              <p className="mt-1 text-sm text-slate-500">For admissions, please use the <Link to={sitePath("admissions") + "#enquiry"} className="font-semibold text-blue-900 underline">admission enquiry form</Link>.</p>
              <div className="mt-6"><MessageForm kind="Contact" button="Send message" /></div>
            </div>
            <div className="space-y-6">
              <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <iframe title="School location map" src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} className="h-72 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <div className="rounded-2xl bg-blue-950 p-6 text-white">
                <h2 className="font-display text-xl font-bold">Our campuses</h2>
                <ul className="mt-4 space-y-4">
                  {site.branches.map((b) => (
                    <li key={b.name} className="flex gap-3">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-amber-300" />
                      <div><p className="font-semibold">{b.name}</p><p className="text-sm text-blue-200">{b.address}</p><p className="text-sm text-blue-200">{b.phone}</p></div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="grievance" className="scroll-mt-24 bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionTitle eyebrow="Grievance redressal" title="Tell us if something isn't right" text="Concerns about academics, transport, fees, safety or staff conduct are handled confidentially by the school's grievance committee." />
            <ul className="mt-6 space-y-2 text-sm text-slate-700">
              <li>• Acknowledgement within 2 working days</li>
              <li>• Resolution within 7 working days</li>
              <li>• For child-safety (POCSO) concerns, call the Principal directly at {site.phone}</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"><MessageForm kind="Grievance" button="Submit grievance" /></div>
        </div>
      </section>
    </>
  );
}
