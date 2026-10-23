import { Link } from "react-router";
import {
  ArrowRight, Award, BellRing, BookOpenCheck, CalendarDays, GraduationCap, HeartHandshake, Megaphone, Quote, ShieldCheck,
  Sparkles, Trophy, Users,
} from "lucide-react";
import { usePublicNotices } from "@/store/communication";
import { useSite } from "@/store/website";
import { holidaysForCurrentYear } from "@/data/calendar";
import { today } from "@/lib/dates";
import { SchoolCrest, SectionTitle, sitePath } from "../SiteLayout";
import { ACHIEVEMENTS, EVENTS, FACILITIES, GALLERY, STAGES, TOPPERS } from "../siteContent";
import { publicNotices, shortDate } from "../siteUtils";

const WHY = [
  { icon: GraduationCap, title: "Qualified, caring teachers", text: "140 trained teachers, a 17:1 student–teacher ratio and a mentor for every child." },
  { icon: BookOpenCheck, title: "Consistent board results", text: "100% pass in Class 10 and 12 board exams for the last three years." },
  { icon: Sparkles, title: "Beyond the classroom", text: "30+ clubs, sports academies, music, art and leadership programmes." },
  { icon: ShieldCheck, title: "Safe, secure campus", text: "CCTV, trained staff, GPS buses and a full-time medical team." },
  { icon: HeartHandshake, title: "Parents as partners", text: "Parent app, monthly PTMs and teachers who are always reachable." },
  { icon: Award, title: "Values & character", text: "Daily assemblies, community service and a strong culture of respect." },
];

export function SiteHome() {
  const site = useSite();
  const notices = publicNotices(usePublicNotices()).slice(0, 5);
  const upcoming = holidaysForCurrentYear().filter((h) => h.end >= today()).slice(0, 4);
  const paragraphs = site.about.split("\n").filter(Boolean);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_15%_25%,#fbbf24_0,transparent_30%),radial-gradient(circle_at_85%_75%,#38bdf8_0,transparent_35%)]" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border-[40px] border-white/5" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.25fr_1fr]">
          <div>
            {site.admissionsOpen && (
              <Link to={sitePath("admissions")} className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1.5 text-sm font-semibold text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/25">
                <BellRing className="size-4" /> Admissions open for {site.admissionYear} <ArrowRight className="size-3.5" />
              </Link>
            )}
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">{site.heroTitle}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-blue-100">{site.heroSubtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={sitePath("admissions") + "#enquiry"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-bold text-blue-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300">
                Admission enquiry <ArrowRight className="size-4" />
              </Link>
              <Link to={sitePath("about")} className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">
                Discover {site.shortName}
              </Link>
            </div>
            <p className="mt-6 text-sm italic text-blue-200">"{site.motto}" — {site.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: `${site.stats.students.toLocaleString("en-IN")}+`, l: "Students" },
              { v: `${site.stats.teachers}+`, l: "Teachers" },
              { v: `${site.stats.resultPercent}%`, l: "Board results" },
              { v: `${new Date().getFullYear() - site.established}`, l: "Years of excellence" },
            ].map((s, i) => (
              <div key={s.l} className={`rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur ${i % 2 ? "translate-y-6" : ""}`}>
                <p className="font-display text-3xl font-extrabold text-amber-300 sm:text-4xl">{s.v}</p>
                <p className="mt-1 text-sm text-blue-100">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notice ticker */}
      <section className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-950 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-300"><Megaphone className="size-3.5" />Latest</span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-10 whitespace-nowrap text-sm font-medium text-blue-950 hover:[animation-play-state:paused]">
              {[...notices, ...notices].map((n, i) => (
                <Link key={`${n.id}-${i}`} to={sitePath("notices")} className="hover:text-amber-700">• {n.title}</Link>
              ))}
              {notices.length === 0 && <span>Welcome to {site.name}</span>}
            </div>
          </div>
        </div>
        <style>{"@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}"}</style>
      </section>

      {/* About + principal */}
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow={`Welcome to ${site.shortName}`} title={`A school that knows every child by name`} />
            {paragraphs.map((p) => <p key={p} className="mt-4 leading-relaxed text-slate-600">{p}</p>)}
            <Link to={sitePath("about")} className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-900 hover:text-amber-600">Read our story <ArrowRight className="size-4" /></Link>
          </div>
          <figure className="relative rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-8 ring-1 ring-amber-200 sm:p-10">
            <Quote className="size-10 text-amber-400" />
            <blockquote className="mt-4 text-lg leading-relaxed text-slate-700">{site.principalMessage}</blockquote>
            <figcaption className="mt-6 flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-blue-950 font-display text-lg font-bold text-amber-300">
                {site.principalName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span>
                <span className="block font-semibold text-blue-950">{site.principalName}</span>
                <span className="block text-sm text-slate-500">Principal</span>
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Why us */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle center eyebrow="Why choose us" title="Everything your child needs to thrive" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid size-12 place-items-center rounded-xl bg-blue-950 text-amber-300"><w.icon className="size-6" /></span>
                <h3 className="mt-4 font-display text-lg font-semibold text-blue-950">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Academics */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionTitle eyebrow="Academics" title="From first steps to board exams" />
            <Link to={sitePath("academics")} className="inline-flex items-center gap-2 font-semibold text-blue-900 hover:text-amber-600">Explore academics <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((s) => (
              <div key={s.title} className="rounded-2xl border border-slate-200 p-5">
                <s.icon className="size-7 text-amber-500" />
                <p className="mt-3 font-display font-semibold text-blue-950">{s.title}</p>
                <p className="text-xs font-semibold text-amber-700">{s.classes}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Toppers & achievements */}
      <section className="bg-blue-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Our pride</p>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Board toppers {new Date().getFullYear()}</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOPPERS.map((t) => (
              <div key={t.name} className="rounded-2xl bg-white/5 p-6 text-center ring-1 ring-white/10">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 font-display text-xl font-bold text-blue-950">
                  {t.name.split(" ").map((w) => w[0]).join("")}
                </span>
                <p className="mt-4 font-display text-3xl font-extrabold text-amber-300">{t.score}</p>
                <p className="mt-1 font-semibold">{t.name}</p>
                <p className="text-sm text-blue-200">{t.cls}</p>
                <p className="mt-2 text-xs text-blue-300">{t.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.title} className="flex gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <a.icon className="size-6 shrink-0 text-amber-300" />
                <div><p className="font-semibold">{a.title}</p><p className="mt-0.5 text-sm text-blue-200">{a.text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Facilities */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionTitle eyebrow="Campus" title={`${site.stats.campusAcres} acres of learning and play`} />
            <Link to={sitePath("facilities")} className="inline-flex items-center gap-2 font-semibold text-blue-900 hover:text-amber-600">All facilities <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FACILITIES.slice(0, 6).map((f) => (
              <div key={f.title} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className={`grid h-36 place-items-center bg-gradient-to-br ${f.tone}`}><f.icon className="size-14 text-white/90" /></div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold text-blue-950">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notices & events */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-blue-950"><Megaphone className="size-5 text-amber-500" />Notice board</h3>
              <Link to={sitePath("notices")} className="text-sm font-semibold text-blue-900 hover:text-amber-600">View all</Link>
            </div>
            <ul className="mt-5 divide-y divide-slate-100">
              {notices.map((n) => (
                <li key={n.id} className="py-3">
                  <p className="text-xs font-semibold text-amber-700">{shortDate(n.date)}</p>
                  <p className="mt-0.5 font-medium text-slate-800">{n.title}</p>
                </li>
              ))}
              {notices.length === 0 && <li className="py-3 text-sm text-slate-500">No notices right now.</li>}
            </ul>
          </div>
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-blue-950"><CalendarDays className="size-5 text-amber-500" />Events & happenings</h3>
              <Link to={sitePath("student-life")} className="text-sm font-semibold text-blue-900 hover:text-amber-600">Student life</Link>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {EVENTS.slice(0, 4).map((e) => (
                <div key={e.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{e.date}</p>
                  <p className="mt-1 font-semibold text-blue-950">{e.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{e.text}</p>
                </div>
              ))}
            </div>
            {upcoming.length > 0 && (
              <div className="mt-4 rounded-2xl bg-blue-950 p-5 text-white">
                <p className="text-sm font-semibold text-amber-300">Coming up</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {upcoming.map((h) => <span key={h.name} className="rounded-full bg-white/10 px-3 py-1 text-sm">{h.name} · {shortDate(h.start)}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Gallery preview */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionTitle eyebrow="Gallery" title="Moments from campus" />
            <Link to={sitePath("gallery")} className="inline-flex items-center gap-2 font-semibold text-blue-900 hover:text-amber-600">Open gallery <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {GALLERY.slice(0, 9).map((g, i) => (
              <div key={g.title} className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${g.tone} ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}>
                <div className={`grid place-items-center ${i === 0 ? "h-40 md:h-full md:min-h-[19rem]" : "h-40"}`}><g.icon className={`text-white/80 transition group-hover:scale-110 ${i === 0 ? "size-20" : "size-10"}`} /></div>
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2.5 pt-6 text-sm font-semibold text-white">{g.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Admission CTA */}
      <section className="bg-gradient-to-r from-amber-400 to-amber-300">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-12 text-center sm:px-6 lg:flex-row lg:text-left">
          <div className="flex items-center gap-4">
            <span className="hidden sm:block"><SchoolCrest size="lg" /></span>
            <div>
              <h2 className="font-display text-2xl font-bold text-blue-950 sm:text-3xl">
                {site.admissionsOpen ? `Admissions open for ${site.admissionYear}` : "Visit our campus"}
              </h2>
              <p className="mt-1 text-blue-950/80">Nursery to Class 11 · Limited seats · Campus tours every Saturday, 10 AM – 1 PM</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to={sitePath("admissions") + "#enquiry"} className="rounded-xl bg-blue-950 px-6 py-3 font-semibold text-white hover:bg-blue-900">Enquire now</Link>
            <Link to={sitePath("contact")} className="rounded-xl border-2 border-blue-950 px-6 py-3 font-semibold text-blue-950 hover:bg-blue-950/10">Book a campus visit</Link>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { icon: Users, title: "Parent portal", text: "Attendance, marks, homework and fees", to: "/login" },
            { icon: Trophy, title: "Results", text: "Board results and toppers", to: sitePath("academics") + "#results" },
            { icon: GraduationCap, title: "Careers", text: "Join our team of educators", to: sitePath("careers") },
          ].map((q) => (
            <Link key={q.title} to={q.to} className="group flex items-center gap-4 rounded-2xl p-5 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-blue-200">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-100 text-amber-700"><q.icon className="size-6" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold text-blue-950">{q.title}</span><span className="block text-sm text-slate-500">{q.text}</span></span>
              <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-900" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
