import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Bell, Building2, Check, CheckCircle2, ChevronDown, Globe, IndianRupee, Mail, MapPin, MessageCircle, Minus,
  PlayCircle, School, Smartphone, Sparkles, TrendingUp, Users, XCircle,
} from "lucide-react";
import {
  CAPABILITY_STATS, COMPARISON, FAQS, HERO_POINTS, INTEGRATIONS, MODULE_GROUPS, MODULES, MULTI_BRANCH_POINTS, PAINS, PLANS,
  PRODUCT, ROLES, SECURITY, STEPS, USE_CASES, type ModuleGroup,
} from "../content";
import { MarketingFooter, MarketingHeader } from "../MarketingChrome";
import { DemoForm } from "../DemoForm";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function SectionHeading({ eyebrow, title, text, light = false }: { eyebrow: string; title: ReactNode; text?: string; light?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={`text-sm font-semibold uppercase tracking-wider ${light ? "text-indigo-300" : "text-indigo-600"}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl ${light ? "text-white" : "text-slate-900"}`}>{title}</h2>
      {text && <p className={`mt-4 text-lg leading-relaxed ${light ? "text-slate-300" : "text-slate-600"}`}>{text}</p>}
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function DashboardMockup() {
  const bars = [62, 78, 70, 88, 94, 81, 96];
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-indigo-500/30 via-violet-500/20 to-sky-400/30 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl shadow-indigo-900/20">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200">app.{PRODUCT.domain}/principal</span>
        </div>
        <div className="grid gap-3 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Good morning,</p>
              <p className="font-display text-base font-semibold text-slate-900">Principal's Dashboard</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">All branches</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Present today", value: "94.2%", tone: "bg-indigo-50 text-indigo-700" },
              { label: "Fees collected", value: "₹18.4L", tone: "bg-emerald-50 text-emerald-700" },
              { label: "New enquiries", value: "37", tone: "bg-amber-50 text-amber-700" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl p-3 ${s.tone}`}>
                <p className="text-[10px] font-medium opacity-80">{s.label}</p>
                <p className="mt-1 font-display text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Fee collection this week</p>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><TrendingUp className="size-3" /> 12%</span>
            </div>
            <div className="mt-3 flex h-24 items-end gap-2">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            {[
              { icon: Bell, text: "Mid-term date sheet published to Classes 6–12", time: "2m" },
              { icon: IndianRupee, text: "₹24,000 received from Aarav Sharma (UPI)", time: "8m" },
              { icon: Users, text: "Class 9-B attendance marked by Mrs. Gupta", time: "15m" },
            ].map((a) => (
              <div key={a.text} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
                <a.icon className="size-3.5 shrink-0 text-indigo-500" />
                <p className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{a.text}</p>
                <span className="text-[10px] text-slate-400">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden w-48 rounded-2xl border border-slate-100 bg-white p-3 shadow-xl sm:block">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-100 text-emerald-600"><MessageCircle className="size-4" /></span>
          <div>
            <p className="text-[11px] font-semibold text-slate-800">WhatsApp to parent</p>
            <p className="text-[10px] text-slate-500">"Riya is absent today"</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white pb-20 pt-10 sm:pt-16">
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(#c7d2fe_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
            <Sparkles className="size-3.5" /> School management software, made for India
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Run your whole school —{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">or every school in your group</span>{" "}
            — from one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Admissions, attendance, exams, fees, HR, transport, hostel and a parent app — connected, simple and secure. Built for CBSE, ICSE and State board schools, from a single campus to a nationwide chain.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#demo" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-700">
              Book a free demo <ArrowRight className="size-4" />
            </a>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 transition hover:border-slate-400">
              <PlayCircle className="size-5 text-indigo-600" /> Try the live demo
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-slate-700">
            {HERO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />{p}</li>
            ))}
          </ul>
        </div>
        <DashboardMockup />
      </div>
    </section>
  );
}

function StatsBand() {
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
        {CAPABILITY_STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 pb-10 text-sm font-semibold text-slate-400 sm:px-6">
        <span className="text-xs font-medium uppercase tracking-wider">Built for</span>
        {["CBSE schools", "ICSE schools", "State board schools", "School chains", "Junior colleges", "Boarding schools"].map((t) => (
          <span key={t} className="text-slate-500">{t}</span>
        ))}
      </div>
    </section>
  );
}

// ── Problems → solutions ─────────────────────────────────────────────────────

function Pains() {
  return (
    <section className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Why schools switch" title="From registers and spreadsheets to one simple system" text="Most schools juggle paper registers, Excel sheets, WhatsApp groups and a separate fee app. SchoolERP replaces all of it." />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.before} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="flex items-start gap-2.5 text-sm text-slate-500"><XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" /><span className="line-through decoration-rose-300">{p.before}</span></p>
              <p className="mt-3 flex items-start gap-2.5 text-[15px] font-medium text-slate-800"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />{p.after}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Modules ──────────────────────────────────────────────────────────────────

function Modules() {
  const [group, setGroup] = useState<ModuleGroup | "All">("All");
  const shown = group === "All" ? MODULES : MODULES.filter((m) => m.group === group);
  return (
    <section id="modules" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Features" title="Every module your school needs, already connected" text="Marks flow into report cards, attendance into parent alerts, fees into accounts. Enter it once — use it everywhere." />
        <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Module groups">
          {(["All", ...MODULE_GROUPS] as const).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${group === g ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((m) => (
            <div key={m.title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/10">
              <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white"><m.icon className="size-5" /></span>
              <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{m.text}</p>
              <ul className="mt-4 space-y-1.5">
                {m.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[13px] text-slate-600"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />{pt}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────────

function Roles() {
  const [active, setActive] = useState(ROLES[1].key);
  const role = ROLES.find((r) => r.key === active)!;
  return (
    <section id="roles" className="scroll-mt-20 bg-slate-950 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading light eyebrow="Role-based portals" title="A portal for every person in your school" text="Fourteen ready-made portals. Each person signs in and sees only what they need — nothing more." />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist" aria-label="Roles">
            {ROLES.map((r) => (
              <button key={r.key} type="button" role="tab" aria-selected={active === r.key} onClick={() => setActive(r.key)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${active === r.key ? "border-indigo-400 bg-indigo-500/15 text-white" : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
                <r.icon className={`size-4 shrink-0 ${active === r.key ? "text-indigo-300" : ""}`} />
                <span className="truncate">{r.title}</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-indigo-950 p-7 sm:p-9" role="tabpanel">
            <span className="grid size-14 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300"><role.icon className="size-7" /></span>
            <h3 className="mt-5 font-display text-2xl font-bold text-white">{role.title}</h3>
            <p className="mt-1 text-lg text-slate-300">{role.summary}</p>
            <ul className="mt-6 space-y-3">
              {role.can.map((c) => (
                <li key={c} className="flex items-start gap-3 text-slate-200"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />{c}</li>
              ))}
            </ul>
            <Link to="/login" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-indigo-300 hover:text-indigo-200">
              Open the {role.title} demo <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Multi-branch ─────────────────────────────────────────────────────────────

function MultiBranch() {
  const tree = [
    { region: "East", branches: ["Ranchi", "Haldia", "Patna"] },
    { region: "North", branches: ["Delhi", "Noida"] },
    { region: "West", branches: ["Pune", "Indore"] },
  ];
  return (
    <section id="multi-branch" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">For school chains</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">One group. Many campuses. One system.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Whether you run 2 schools in one city or 200 across the country, SchoolERP mirrors your structure — and lets each person see exactly the campuses they are responsible for.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {MULTI_BRANCH_POINTS.map((p) => (
              <div key={p.title} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><p.icon className="size-5" /></span>
                <div>
                  <p className="font-semibold text-slate-900">{p.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/60 p-6 sm:p-8">
          <div className="mx-auto flex w-fit items-center gap-2.5 rounded-2xl bg-indigo-600 px-5 py-3 text-white shadow-lg shadow-indigo-600/30">
            <Building2 className="size-5" />
            <div><p className="text-xs opacity-80">Organization</p><p className="font-semibold">Your Education Trust</p></div>
          </div>
          <div className="mx-auto h-6 w-px bg-indigo-300" />
          <div className="grid gap-4 sm:grid-cols-3">
            {tree.map((t) => (
              <div key={t.region} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm">
                  <MapPin className="size-4" /> {t.region} region
                </div>
                <div className="h-4 w-px bg-indigo-200" />
                <div className="w-full space-y-1.5">
                  {t.branches.map((b) => (
                    <div key={b} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
                      <School className="size-4 text-violet-500" /> {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
            <p className="font-semibold text-slate-800">Who sees what</p>
            <ul className="mt-2 space-y-1 text-slate-600">
              <li>• <b>Chairman</b> — every branch</li>
              <li>• <b>Regional head (East)</b> — Ranchi, Haldia, Patna</li>
              <li>• <b>Principal, Ranchi</b> — only Ranchi</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Use cases, website & app ─────────────────────────────────────────────────

function UseCases() {
  return (
    <section id="use-cases" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Who it's for" title="Fits the way your institution works" />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {USE_CASES.map((u) => (
            <div key={u.title} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><u.icon className="size-6" /></span>
              <h3 className="mt-5 font-display text-xl font-semibold text-slate-900">{u.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{u.text}</p>
              <ul className="mt-5 space-y-2">
                {u.points.map((p) => <li key={p} className="flex items-center gap-2 text-sm text-slate-700"><Check className="size-4 text-emerald-500" />{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WebsiteAndApp() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white sm:p-10">
          <Globe className="size-10 text-emerald-200" />
          <h3 className="mt-5 font-display text-2xl font-bold sm:text-3xl">A school website, included free</h3>
          <p className="mt-3 leading-relaxed text-emerald-50">
            A modern website for your school that updates itself — notices, results, faculty, fee structure and admissions come straight from SchoolERP. Admission enquiries land at your front desk; job applications reach HR.
          </p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {["Admissions & enquiry form", "Notices & circulars", "Careers & applications", "CBSE mandatory disclosure", "Photo gallery & events", "Alumni & contact"].map((p) => (
              <li key={p} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-200" />{p}</li>
            ))}
          </ul>
          <Link to="/school" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-50">
            See a sample school website <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white sm:p-10">
          <Smartphone className="size-10 text-indigo-200" />
          <h3 className="mt-5 font-display text-2xl font-bold sm:text-3xl">The parent app families love</h3>
          <p className="mt-3 max-w-md leading-relaxed text-indigo-100">
            Attendance alerts, homework, marks, timetable, fee payment and messages with teachers — for all their children, in one login.
          </p>
          <div className="mt-8 flex gap-3">
            {[
              { t: "Attendance", v: "Present", c: "bg-emerald-400/20 text-emerald-100" },
              { t: "Fee due", v: "₹12,000", c: "bg-amber-400/20 text-amber-100" },
              { t: "Maths test", v: "46 / 50", c: "bg-sky-400/20 text-sky-100" },
            ].map((x) => (
              <div key={x.t} className={`flex-1 rounded-2xl p-3 ${x.c}`}>
                <p className="text-xs opacity-80">{x.t}</p>
                <p className="mt-1 font-display text-lg font-bold">{x.v}</p>
              </div>
            ))}
          </div>
          <a href="#demo" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-50">
            Get the app for your school <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Onboarding, security, integrations ───────────────────────────────────────

function HowItWorks() {
  return (
    <section className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Getting started" title="Live in about a week — we do the heavy lifting" />
        <ol className="mt-14 grid gap-6 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="grid size-10 place-items-center rounded-full bg-indigo-600 font-display font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="security" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Security & privacy" title="Children's data deserves the highest protection" text="Security is built into the foundation of SchoolERP, not added later." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s) => (
            <div key={s.title} className="flex gap-4 rounded-2xl border border-slate-200 p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><s.icon className="size-5" /></span>
              <div>
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-14 rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Works with the tools you already use</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {INTEGRATIONS.map((i) => (
              <span key={i.name} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                <i.icon className="size-4 text-indigo-500" />{i.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────

function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <section id="pricing" className="scroll-mt-20 bg-gradient-to-b from-white to-indigo-50/60 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Pricing" title="Simple pricing, per campus" text="No setup fee. No per-student charges. Cancel any time and take your data with you." />
        <div className="mt-8 flex items-center justify-center gap-3 text-sm font-semibold">
          <span className={yearly ? "text-slate-500" : "text-slate-900"}>Monthly</span>
          <button type="button" role="switch" aria-checked={yearly} aria-label="Bill yearly" onClick={() => setYearly((y) => !y)}
            className={`relative h-7 w-12 rounded-full transition ${yearly ? "bg-indigo-600" : "bg-slate-300"}`}>
            <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${yearly ? "left-6" : "left-1"}`} />
          </button>
          <span className={yearly ? "text-slate-900" : "text-slate-500"}>Yearly</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">2 months free</span>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => {
            const perMonth = p.monthly === null ? null : yearly ? Math.round((p.monthly * 10) / 12) : p.monthly;
            return (
              <div key={p.code} className={`relative flex flex-col rounded-3xl border bg-white p-8 ${p.highlight ? "border-indigo-500 shadow-2xl shadow-indigo-500/20 lg:-my-3 lg:py-11" : "border-slate-200 shadow-sm"}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
                <h3 className="font-display text-xl font-bold text-slate-900">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{p.tagline}</p>
                <div className="mt-6 flex items-end gap-1">
                  <span className="font-display text-4xl font-extrabold text-slate-900">{perMonth === null ? "Custom" : inr(perMonth)}</span>
                  {perMonth !== null && <span className="pb-1 text-sm text-slate-500">/ campus / month</span>}
                </div>
                <p className="mt-1 h-5 text-xs text-slate-500">
                  {perMonth !== null && yearly && p.monthly ? `Billed ${inr(p.monthly * 10)} per campus yearly` : "Billed monthly · + GST"}
                </p>
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{p.limits}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700"><Check className="mt-0.5 size-4 shrink-0 text-indigo-600" />{f}</li>)}
                </ul>
                <a href="#demo" className={`mt-8 rounded-xl px-5 py-3 text-center font-semibold transition ${p.highlight ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
                  {p.code === "enterprise" ? "Talk to sales" : "Start free 30-day trial"}
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-16 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th scope="col" className="px-5 py-4 font-semibold text-slate-700">Compare plans</th>
                {PLANS.map((p) => <th key={p.code} scope="col" className="px-5 py-4 text-center font-semibold text-slate-900">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="px-5 py-3.5 font-normal text-slate-700">{row.feature}</th>
                  {row.plans.map((v, i) => (
                    <td key={i} className="px-5 py-3.5 text-center">
                      {v === true ? <Check className="mx-auto size-5 text-emerald-500" aria-label="Included" /> : v === false ? <Minus className="mx-auto size-5 text-slate-300" aria-label="Not included" /> : <span className="font-medium text-slate-700">{v}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Prices exclude 18% GST. Online payment gateway charges (Razorpay) are paid directly to the gateway.</p>
      </div>
    </section>
  );
}

// ── FAQ & demo ───────────────────────────────────────────────────────────────

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions schools usually ask" />
        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-slate-900 hover:bg-slate-50">
                {f.q}
                <ChevronDown className={`size-5 shrink-0 text-slate-400 transition ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="px-6 pb-5 leading-relaxed text-slate-600">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-20 bg-slate-950 py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Book a free demo</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">See SchoolERP with your school's needs in mind</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            A 30-minute online call with our team. We'll show you the modules that matter to you, answer every question and share pricing for your campuses.
          </p>
          <ul className="mt-8 space-y-4">
            {["Personal walkthrough for your principal and office", "Free data migration from Excel or your old software", "30-day free trial with full features", "Training in Hindi and English"].map((p) => (
              <li key={p} className="flex items-center gap-3 text-slate-200"><CheckCircle2 className="size-5 text-emerald-400" />{p}</li>
            ))}
          </ul>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <a href={`https://wa.me/${PRODUCT.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-200 hover:border-slate-700">
              <MessageCircle className="size-6 text-emerald-400" /><div><p className="text-xs text-slate-400">WhatsApp us</p><p className="font-semibold">{PRODUCT.whatsapp}</p></div>
            </a>
            <a href={`mailto:${PRODUCT.email}`} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-200 hover:border-slate-700">
              <Mail className="size-6 text-indigo-300" /><div><p className="text-xs text-slate-400">Email</p><p className="font-semibold">{PRODUCT.email}</p></div>
            </a>
          </div>
        </div>
        <DemoForm />
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-gradient-to-r from-indigo-600 to-violet-600 py-14">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 text-center sm:px-6 lg:flex-row lg:text-left">
        <div>
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">Ready to see it working?</h2>
          <p className="mt-1 text-indigo-100">Open the live demo — every role has a sample login. No sign-up needed.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/login" className="rounded-xl bg-white px-6 py-3 font-semibold text-indigo-700 hover:bg-indigo-50">Open live demo</Link>
          <a href="#demo" className="rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10">Book a call</a>
        </div>
      </div>
    </section>
  );
}

export function ProductLanding() {
  useEffect(() => {
    document.title = `${PRODUCT.name} — School management software for schools & school chains`;
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, []);

  return (
    <div className="min-h-screen scroll-smooth bg-white text-slate-900 antialiased">
      <MarketingHeader />
      <main>
        <Hero />
        <StatsBand />
        <Pains />
        <Modules />
        <Roles />
        <MultiBranch />
        <UseCases />
        <WebsiteAndApp />
        <HowItWorks />
        <Security />
        <Pricing />
        <Faq />
        <DemoSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
