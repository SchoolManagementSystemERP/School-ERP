import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Award, CheckCircle2, ChevronLeft, ChevronRight, Compass, Eye, Flag, Quote, Search, Target, Users, X } from "lucide-react";
import { usePublicFaculty } from "@/store/publicSite";
import { useSite } from "@/store/website";
import { PageHero, SectionTitle, siteInput, sitePath } from "../SiteLayout";
import { ACHIEVEMENTS, CLUBS, EVENTS, FACILITIES, GALLERY, PEDAGOGY, RESULTS, STAGES, STREAMS, TOPPERS, type GalleryItem } from "../siteContent";

const initials = (name: string) => name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Shri|Smt\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("");

// ── About ────────────────────────────────────────────────────────────────────

export function SiteAbout() {
  const site = useSite();
  const milestones = [
    { year: site.established, text: `Founded by the Greenwood Education Trust with 120 students and 9 teachers.` },
    { year: site.established + 4, text: `Affiliated to ${site.board}, New Delhi up to the senior secondary level.` },
    { year: site.established + 10, text: "New senior wing with science labs, library and auditorium." },
    { year: site.established + 16, text: "Junior Wing opened at Aliganj for Nursery to Class 5." },
    { year: site.established + 22, text: "Atal Tinkering Lab and smart classrooms across the campus." },
    { year: site.established + 27, text: `${site.stats.students.toLocaleString("en-IN")}+ students and ${site.stats.teachers}+ teachers on two campuses.` },
  ];
  const values = ["Integrity", "Respect", "Curiosity", "Compassion", "Excellence", "Responsibility"];

  return (
    <>
      <PageHero title={`About ${site.shortName}`} subtitle={site.tagline} />
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <SectionTitle eyebrow="Our story" title={`${new Date().getFullYear() - site.established} years of shaping young minds`} />
            {site.about.split("\n").filter(Boolean).map((p) => <p key={p} className="mt-4 text-lg leading-relaxed text-slate-600">{p}</p>)}
          </div>
          <div className="grid grid-cols-2 gap-4 self-start">
            {[
              { v: site.established, l: "Established" },
              { v: `${site.stats.students.toLocaleString("en-IN")}+`, l: "Students" },
              { v: `${site.stats.teachers}+`, l: "Teachers" },
              { v: `${site.stats.campusAcres} acres`, l: "Green campus" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-blue-950 p-6 text-center text-white">
                <p className="font-display text-3xl font-extrabold text-amber-300">{s.v}</p>
                <p className="mt-1 text-sm text-blue-100">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <Eye className="size-9 text-amber-500" />
            <h3 className="mt-4 font-display text-2xl font-bold text-blue-950">Vision</h3>
            <p className="mt-3 leading-relaxed text-slate-600">{site.vision}</p>
          </div>
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
            <Target className="size-9 text-amber-500" />
            <h3 className="mt-4 font-display text-2xl font-bold text-blue-950">Mission</h3>
            <ul className="mt-3 space-y-3">
              {site.mission.map((m) => <li key={m} className="flex gap-3 text-slate-600"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />{m}</li>)}
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-blue-950 p-6">
            <span className="mr-2 flex items-center gap-2 font-semibold text-amber-300"><Compass className="size-5" />Core values</span>
            {values.map((v) => <span key={v} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white">{v}</span>)}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2">
          {[
            { who: "Principal's message", name: site.principalName, role: `Principal · ${site.principalQualification}`, text: site.principalMessage },
            { who: "Chairman's message", name: site.chairmanName, role: "Chairman, Greenwood Education Trust", text: site.chairmanMessage },
          ].map((m) => (
            <figure key={m.who} className="rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-8 ring-1 ring-amber-200">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-700">{m.who}</p>
              <Quote className="mt-4 size-9 text-amber-400" />
              <blockquote className="mt-3 text-lg leading-relaxed text-slate-700">{m.text}</blockquote>
              <figcaption className="mt-6 flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-full bg-blue-950 font-display text-lg font-bold text-amber-300">{initials(m.name)}</span>
                <span><span className="block font-semibold text-blue-950">{m.name}</span><span className="block text-sm text-slate-500">{m.role}</span></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionTitle center eyebrow="Milestones" title="Our journey" />
          <ol className="relative mt-12 border-l-2 border-amber-300 pl-8">
            {milestones.map((m) => (
              <li key={m.year} className="relative mb-8 last:mb-0">
                <span className="absolute -left-[42px] grid size-5 place-items-center rounded-full bg-amber-400 ring-4 ring-slate-50" />
                <p className="font-display text-xl font-bold text-blue-950">{m.year}</p>
                <p className="mt-1 text-slate-600">{m.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { icon: Flag, title: `${site.board} affiliation`, text: `Affiliation No. ${site.affiliationNo} · School Code ${site.schoolCode}` },
            { icon: Award, title: "Recognised by the State", text: "Recognised under the RTE Act, 2009 by the Government of Uttar Pradesh." },
            { icon: Users, title: "Managed by", text: "Greenwood Education Trust — a registered non-profit trust." },
          ].map((x) => (
            <div key={x.title} className="flex gap-4 rounded-2xl p-6 ring-1 ring-slate-200">
              <x.icon className="size-7 shrink-0 text-amber-500" />
              <div><p className="font-semibold text-blue-950">{x.title}</p><p className="mt-1 text-sm text-slate-600">{x.text}</p></div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center"><Link to={sitePath("disclosure")} className="font-semibold text-blue-900 hover:text-amber-600">See CBSE mandatory public disclosure →</Link></p>
      </section>
    </>
  );
}

// ── Academics ────────────────────────────────────────────────────────────────

export function SiteAcademics() {
  const site = useSite();
  return (
    <>
      <PageHero title="Academics" subtitle={`A ${site.board} curriculum taught with care, from Nursery to Class 12.`} />
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Stages of learning" title="The right approach at every age" />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s) => (
              <div key={s.title} className="rounded-2xl p-6 ring-1 ring-slate-200">
                <span className="grid size-12 place-items-center rounded-xl bg-amber-100 text-amber-700"><s.icon className="size-6" /></span>
                <p className="mt-4 font-display text-xl font-semibold text-blue-950">{s.title}</p>
                <p className="text-sm font-semibold text-amber-700">{s.classes}</p>
                <p className="mt-2 leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Senior secondary" title="Streams offered in Classes 11 & 12" />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STREAMS.map((s) => (
              <div key={s.name} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="font-display text-lg font-bold text-blue-950">{s.name}</p>
                <ul className="mt-3 space-y-1.5">{s.subjects.map((x) => <li key={x} className="flex gap-2 text-sm text-slate-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="How we teach" title="Learning that lasts" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PEDAGOGY.map((p, i) => (
              <div key={p.title} className="flex gap-4 rounded-2xl p-6 ring-1 ring-slate-200">
                <span className="font-display text-3xl font-extrabold text-amber-400">{String(i + 1).padStart(2, "0")}</span>
                <div><p className="font-semibold text-blue-950">{p.title}</p><p className="mt-1 text-sm leading-relaxed text-slate-600">{p.text}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl bg-blue-950 p-7 text-white">
              <p className="font-display text-xl font-bold text-amber-300">Assessment</p>
              <ul className="mt-4 space-y-2 text-blue-100">
                <li>• Classes 1–8: continuous assessment with periodic tests, projects and a term-end exam</li>
                <li>• Classes 9–12: CBSE pattern — periodic tests, half-yearly, pre-boards and internal assessment</li>
                <li>• Report cards each term with grades, skills and teacher remarks — also in the parent app</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-amber-50 p-7 ring-1 ring-amber-200">
              <p className="font-display text-xl font-bold text-blue-950">Beyond the syllabus</p>
              <ul className="mt-4 space-y-2 text-slate-700">
                <li>• JEE / NEET / CUET foundation classes from Class 9</li>
                <li>• Olympiads, NTSE and spell-bee preparation</li>
                <li>• Career counselling and university guidance for Classes 10–12</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="results" className="scroll-mt-24 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Results" title="Board examination results" />
          <div className="mt-8 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-blue-950 text-sm text-white">
                <tr><th className="px-5 py-3.5">Year</th><th className="px-5 py-3.5">Class 10 pass %</th><th className="px-5 py-3.5">Class 10 average</th><th className="px-5 py-3.5">Class 12 pass %</th><th className="px-5 py-3.5">Class 12 average</th></tr>
              </thead>
              <tbody>
                {RESULTS.map((r) => (
                  <tr key={r.year} className="border-t border-slate-100"><td className="px-5 py-3.5 font-semibold text-blue-950">{r.year}</td><td className="px-5 py-3.5">{r.c10}</td><td className="px-5 py-3.5">{r.c10avg}</td><td className="px-5 py-3.5">{r.c12}</td><td className="px-5 py-3.5">{r.c12avg}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TOPPERS.map((t) => (
              <div key={t.name} className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
                <p className="font-display text-2xl font-extrabold text-amber-600">{t.score}</p>
                <p className="mt-1 font-semibold text-blue-950">{t.name}</p>
                <p className="text-sm text-slate-500">{t.cls}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link to={sitePath("notices")} className="inline-flex items-center gap-2 font-semibold text-blue-900 hover:text-amber-600">Academic calendar, date sheets & syllabus <ArrowRight className="size-4" /></Link>
          </p>
        </div>
      </section>
    </>
  );
}

// ── Facilities ───────────────────────────────────────────────────────────────

export function SiteFacilities() {
  const site = useSite();
  return (
    <>
      <PageHero title="Facilities" subtitle={`A ${site.stats.campusAcres}-acre campus designed for learning, play and safety.`} />
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-3">
          {FACILITIES.map((f) => (
            <div key={f.title} className="overflow-hidden rounded-2xl ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
              <div className={`grid h-44 place-items-center bg-gradient-to-br ${f.tone}`}><f.icon className="size-16 text-white/90" /></div>
              <div className="p-6">
                <h2 className="font-display text-xl font-semibold text-blue-950">{f.title}</h2>
                <p className="mt-2 leading-relaxed text-slate-600">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-blue-950 py-14 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 text-center sm:px-6 md:flex-row md:text-left">
          <div><p className="font-display text-2xl font-bold">See it for yourself</p><p className="mt-1 text-blue-200">Campus tours every Saturday, 10 AM – 1 PM. No appointment needed.</p></div>
          <Link to={sitePath("contact")} className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-blue-950 hover:bg-amber-300">Plan a visit</Link>
        </div>
      </section>
    </>
  );
}

// ── Student life ─────────────────────────────────────────────────────────────

export function SiteStudentLife() {
  const houses = [
    { name: "Aryabhatta", color: "bg-rose-500", value: "Courage" },
    { name: "Tagore", color: "bg-sky-500", value: "Creativity" },
    { name: "Raman", color: "bg-emerald-500", value: "Curiosity" },
    { name: "Kalam", color: "bg-amber-500", value: "Commitment" },
  ];
  return (
    <>
      <PageHero title="Student Life" subtitle="Clubs, sports, celebrations and friendships that last a lifetime." />
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Clubs & activities" title="Something for every interest" text="Every student joins at least two clubs. Clubs meet weekly during the activity period." />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CLUBS.map((c) => (
              <div key={c.name} className="flex flex-col items-center gap-3 rounded-2xl p-5 text-center ring-1 ring-slate-200 transition hover:bg-amber-50 hover:ring-amber-200">
                <c.icon className="size-8 text-blue-900" />
                <p className="text-sm font-semibold text-blue-950">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Houses & student council" title="Leadership starts here" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {houses.map((h) => (
              <div key={h.name} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className={`h-2 ${h.color}`} />
                <div className="p-5"><p className="font-display text-lg font-bold text-blue-950">{h.name} House</p><p className="text-sm text-slate-500">Value: {h.value}</p></div>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-slate-600">The Student Council — Head Boy, Head Girl, House Captains and class representatives — is elected every July and leads assemblies, events and community-service drives.</p>
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Events" title="Highlights of the year" />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {EVENTS.map((e) => (
              <div key={e.title} className="rounded-2xl p-6 ring-1 ring-slate-200">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{e.date}</p>
                <p className="mt-1 font-display text-lg font-semibold text-blue-950">{e.title}</p>
                <p className="mt-2 text-slate-600">{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-blue-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-bold">Achievements</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.title} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                <a.icon className="size-8 text-amber-300" />
                <p className="mt-3 font-semibold">{a.title}</p>
                <p className="mt-1 text-sm text-blue-200">{a.text}</p>
              </div>
            ))}
          </div>
          <Link to={sitePath("gallery")} className="mt-10 inline-flex items-center gap-2 font-semibold text-amber-300 hover:text-amber-200">See the photo gallery <ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export function SiteGallery() {
  const albums = ["All", ...Array.from(new Set(GALLERY.map((g) => g.album)))] as const;
  const [album, setAlbum] = useState<string>("All");
  const [open, setOpen] = useState<number | null>(null);
  const items: GalleryItem[] = album === "All" ? GALLERY : GALLERY.filter((g) => g.album === album);
  const current = open === null ? null : items[open];

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  return (
    <>
      <PageHero title="Gallery" subtitle="Glimpses of life at school." />
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap justify-center gap-2">
            {albums.map((a) => (
              <button key={a} type="button" onClick={() => setAlbum(a)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${album === a ? "bg-blue-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{a}</button>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {items.map((g, i) => (
              <button key={g.title} type="button" onClick={() => setOpen(i)} className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br text-left ${g.tone}`}>
                <div className="grid h-48 place-items-center"><g.icon className="size-14 text-white/80 transition group-hover:scale-110" /></div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-3 pt-8">
                  <p className="text-sm font-semibold text-white">{g.title}</p><p className="text-xs text-white/80">{g.album}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      {current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={current.title} onClick={() => setOpen(null)}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className={`grid aspect-video place-items-center rounded-2xl bg-gradient-to-br ${current.tone}`}><current.icon className="size-28 text-white/85" /></div>
            <p className="mt-3 text-center font-semibold text-white">{current.title} <span className="text-white/60">· {current.album}</span></p>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="absolute -top-3 -right-3 grid size-10 place-items-center rounded-full bg-white text-slate-800 shadow"><X className="size-5" /></button>
            <button type="button" onClick={() => setOpen((open! - 1 + items.length) % items.length)} aria-label="Previous" className="absolute left-2 top-[45%] grid size-10 place-items-center rounded-full bg-white/90 text-slate-800"><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => setOpen((open! + 1) % items.length)} aria-label="Next" className="absolute right-2 top-[45%] grid size-10 place-items-center rounded-full bg-white/90 text-slate-800"><ChevronRight className="size-5" /></button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Faculty ──────────────────────────────────────────────────────────────────

export function SiteFaculty() {
  const teachers = usePublicFaculty();
  const site = useSite();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const active = teachers; // the website receives active teachers only
  const departments = useMemo(() => ["All", ...Array.from(new Set(active.map((t) => t.department).filter(Boolean))).sort()], [active]);
  const shown = active.filter(
    (t) => (dept === "All" || t.department === dept) && (!q || `${t.name} ${t.department} ${t.designation}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <PageHero title="Our Faculty" subtitle="Qualified, experienced and passionate about teaching." />
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
            <p className="font-display text-lg font-bold text-blue-950">Leadership</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <p className="text-slate-700"><b>{site.principalName}</b> — Principal<br /><span className="text-sm text-slate-500">{site.principalQualification}</span></p>
              <p className="text-slate-700"><b>{site.chairmanName}</b> — Chairman<br /><span className="text-sm text-slate-500">Greenwood Education Trust</span></p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search teachers</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className={`${siteInput} pl-10`} placeholder="Search by name or subject" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className={`${siteInput} sm:w-56`} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              {departments.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((t) => (
              <div key={t.id} className="rounded-2xl p-6 text-center ring-1 ring-slate-200">
                <span className="mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br from-blue-900 to-blue-950 font-display text-2xl font-bold text-amber-300">{initials(t.name)}</span>
                <p className="mt-4 font-semibold text-blue-950">{t.name}</p>
                <p className="text-sm font-medium text-amber-700">{t.department}</p>
                <p className="mt-1 text-xs text-slate-500">{t.designation}</p>
                <p className="mt-3 text-xs text-slate-600">{t.highestQualification}{t.bEd ? ", B.Ed." : ""}</p>
                {t.experience && <p className="text-xs text-slate-500">{t.experience} experience</p>}
              </div>
            ))}
          </div>
          {shown.length === 0 && <p className="mt-10 text-center text-slate-500">No teachers match your search.</p>}
          <div className="mt-12 rounded-2xl bg-blue-950 p-8 text-center text-white">
            <p className="font-display text-2xl font-bold">Want to teach with us?</p>
            <p className="mt-1 text-blue-200">We are always looking for passionate educators.</p>
            <Link to={sitePath("careers")} className="mt-5 inline-block rounded-xl bg-amber-400 px-6 py-3 font-bold text-blue-950 hover:bg-amber-300">See open positions</Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ── CBSE mandatory public disclosure ─────────────────────────────────────────

export { SiteDisclosure } from "./SiteDisclosure";
