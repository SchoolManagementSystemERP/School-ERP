import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  ChevronDown, ChevronRight, Clock, LogIn, Mail, MapPin, Menu, MessageCircle, Phone, X,
} from "lucide-react";
import { FacebookIcon, InstagramIcon, XIcon, YoutubeIcon } from "@/components/common/SocialIcons";
import { useSite } from "@/store/website";
import { SITE_MORE, SITE_NAV } from "./siteContent";

export const SITE_BASE = "/school";
export const sitePath = (to: string) => (to ? `${SITE_BASE}/${to}` : SITE_BASE);

export function SchoolCrest({ size = "md" }: { size?: "md" | "lg" }) {
  const site = useSite();
  const box = size === "lg" ? "size-16 text-2xl" : "size-11 text-lg";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full border-2 border-amber-400 bg-blue-950 font-display font-bold text-amber-300 shadow-md`} aria-hidden>
      {site.shortName.slice(0, 3)}
    </span>
  );
}

/** Title band at the top of every inner page. */
export function PageHero({ title, subtitle, crumb }: { title: string; subtitle?: string; crumb?: string }) {
  return (
    <section className="relative overflow-hidden bg-blue-950 py-14 text-white sm:py-20">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,#fbbf24_0,transparent_35%),radial-gradient(circle_at_80%_60%,#38bdf8_0,transparent_35%)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-blue-200">
          <Link to={SITE_BASE} className="hover:text-white">Home</Link>
          <ChevronRight className="size-3.5" />
          <span className="text-amber-300">{crumb ?? title}</span>
        </nav>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-lg text-blue-100">{subtitle}</p>}
      </div>
    </section>
  );
}

export function SectionTitle({ eyebrow, title, text, center = false }: { eyebrow?: string; title: ReactNode; text?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-blue-950 sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-lg leading-relaxed text-slate-600">{text}</p>}
    </div>
  );
}

export const siteInput = "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-700/15";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-3 py-3 text-[14px] font-semibold transition ${isActive ? "border-amber-400 text-blue-950" : "border-transparent text-slate-600 hover:text-blue-900"}`;

export function SiteLayout() {
  const site = useSite();
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // Pages load lazily: wait for the target section to appear, then scroll to it.
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el || ++tries > 20) {
        window.clearInterval(timer);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash]);

  useEffect(() => {
    document.title = `${site.name}, ${site.city}`;
  }, [site.name, site.city]);

  const wa = `https://wa.me/${site.whatsapp.replace(/\D/g, "")}`;

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Top bar */}
      <div className="bg-blue-950 text-[13px] text-blue-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-white"><Phone className="size-3.5 text-amber-300" />{site.phone}</a>
            <a href={`mailto:${site.email}`} className="hidden items-center gap-1.5 hover:text-white sm:flex"><Mail className="size-3.5 text-amber-300" />{site.email}</a>
            <span className="hidden items-center gap-1.5 md:flex"><Clock className="size-3.5 text-amber-300" />{site.officeHours}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden lg:inline">Affiliated to {site.board}, New Delhi · No. {site.affiliationNo}</span>
            <Link to="/login" className="flex items-center gap-1.5 font-semibold text-amber-300 hover:text-amber-200"><LogIn className="size-3.5" />Parent / Staff Login</Link>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={SITE_BASE} className="flex min-w-0 items-center gap-3">
            <SchoolCrest />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold leading-tight text-blue-950 sm:text-xl">{site.name}</span>
              <span className="block truncate text-xs text-slate-500">{site.city} · Estd. {site.established} · {site.board}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {site.admissionsOpen && (
              <Link to={sitePath("admissions")} className="hidden rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-blue-950 shadow-sm transition hover:bg-amber-300 sm:inline-block">
                Admissions {site.admissionYear}
              </Link>
            )}
            <button type="button" className="grid size-10 place-items-center rounded-lg text-blue-950 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        <div className="hidden border-t border-slate-100 lg:block">
          <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6" aria-label="Main">
            {SITE_NAV.map((n) => <NavLink key={n.label} to={sitePath(n.to)} end={n.to === ""} className={navCls}>{n.label}</NavLink>)}
            <div className="relative">
              <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="flex items-center gap-1 whitespace-nowrap px-3 py-3 text-[14px] font-semibold text-slate-600 hover:text-blue-900">
                More <ChevronDown className={`size-4 transition ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-full z-10 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {SITE_MORE.map((n) => <NavLink key={n.label} to={sitePath(n.to)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-amber-50 text-amber-700" : "text-slate-700 hover:bg-slate-50"}`}>{n.label}</NavLink>)}
                </div>
              )}
            </div>
          </nav>
        </div>
        {open && (
          <nav className="max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 lg:hidden" aria-label="Mobile">
            <div className="grid grid-cols-2 gap-1">
              {[...SITE_NAV, ...SITE_MORE].map((n) => (
                <NavLink key={n.label} to={sitePath(n.to)} end={n.to === ""} className={({ isActive }) => `rounded-lg px-3 py-2.5 text-[15px] font-semibold ${isActive ? "bg-amber-50 text-amber-700" : "text-slate-700 hover:bg-slate-50"}`}>{n.label}</NavLink>
              ))}
            </div>
            {site.admissionsOpen && <Link to={sitePath("admissions")} className="mt-3 block rounded-lg bg-amber-400 px-4 py-2.5 text-center font-bold text-blue-950">Admissions {site.admissionYear} open — apply now</Link>}
          </nav>
        )}
      </header>

      <main><Outlet /></main>

      {/* Footer */}
      <footer className="bg-blue-950 text-blue-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-3"><SchoolCrest /><p className="font-display text-lg font-bold text-white">{site.name}</p></div>
            <p className="mt-4 text-sm leading-relaxed text-blue-200">{site.tagline}. A {site.board}-affiliated co-educational school since {site.established}.</p>
            <div className="mt-5 flex gap-2">
              {[
                { href: site.social.facebook, icon: FacebookIcon, label: "Facebook" },
                { href: site.social.instagram, icon: InstagramIcon, label: "Instagram" },
                { href: site.social.youtube, icon: YoutubeIcon, label: "YouTube" },
                { href: site.social.x, icon: XIcon, label: "X" },
              ].map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="grid size-9 place-items-center rounded-full bg-white/10 transition hover:bg-amber-400 hover:text-blue-950"><s.icon className="size-4" /></a>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-white">Quick links</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {[...SITE_NAV.slice(1), ...SITE_MORE].map((n) => <li key={n.label}><Link to={sitePath(n.to)} className="text-blue-200 hover:text-amber-300">{n.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">For parents</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link to="/login" className="text-blue-200 hover:text-amber-300">Parent portal & app</Link></li>
              <li><Link to="/login" className="text-blue-200 hover:text-amber-300">Pay fees online</Link></li>
              <li><Link to={sitePath("notices")} className="text-blue-200 hover:text-amber-300">Circulars & holiday list</Link></li>
              <li><Link to={sitePath("notices") + "#tc"} className="text-blue-200 hover:text-amber-300">TC verification</Link></li>
              <li><Link to={sitePath("contact") + "#grievance"} className="text-blue-200 hover:text-amber-300">Grievance / feedback</Link></li>
              <li><Link to={sitePath("disclosure")} className="text-blue-200 hover:text-amber-300">CBSE mandatory disclosure</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Contact us</p>
            <ul className="mt-4 space-y-3 text-sm text-blue-200">
              <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-amber-300" />{site.address}, {site.city}, {site.state} {site.pincode}</li>
              <li className="flex gap-2.5"><Phone className="size-4 shrink-0 text-amber-300" />{site.phone}</li>
              <li className="flex gap-2.5"><Mail className="size-4 shrink-0 text-amber-300" />{site.email}</li>
              <li className="flex gap-2.5"><Clock className="size-4 shrink-0 text-amber-300" />{site.officeHours}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-blue-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© {new Date().getFullYear()} {site.name}. Affiliation No. {site.affiliationNo} · School Code {site.schoolCode}</p>
            <p>Website powered by <Link to="/" className="font-semibold text-amber-300 hover:text-amber-200">SchoolERP</Link></p>
          </div>
        </div>
      </footer>

      <a href={wa} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 transition hover:scale-105 hover:bg-emerald-600">
        <MessageCircle className="size-7" />
      </a>
    </div>
  );
}
