import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, GraduationCap, Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { NAV_LINKS, PRODUCT } from "./content";

export function ProductLogo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label={`${PRODUCT.name} home`}>
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
        <GraduationCap className="size-5" />
      </span>
      <span className={`font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        School<span className="text-indigo-500">ERP</span>
      </span>
    </Link>
  );
}

/** Links to sections of the landing page work from other pages too. */
const sectionHref = (href: string, onHome: boolean) => (onHome ? href : `/${href}`);

export function MarketingHeader({ onHome = true }: { onHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-50 transition-all ${scrolled || open ? "border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-lg" : "bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <ProductLogo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={sectionHref(l.href, onHome)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {l.label}
            </a>
          ))}
          <Link to="/school" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
            School website demo
          </Link>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            Log in
          </Link>
          <a href={sectionHref("#demo", onHome)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-700">
            Book a free demo <ArrowRight className="size-4" />
          </a>
        </div>
        <button type="button" className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-2 lg:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={sectionHref(l.href, onHome)} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50">
                {l.label}
              </a>
            ))}
            <Link to="/school" className="rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50">School website demo</Link>
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/login" className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700">Log in</Link>
            <a href={sectionHref("#demo", onHome)} onClick={() => setOpen(false)} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white">Book a demo</a>
          </div>
        </div>
      )}
    </header>
  );
}

const FOOTER_COLUMNS = [
  { title: "Product", links: [["Features", "/#modules"], ["Role portals", "/#roles"], ["Multi-branch", "/#multi-branch"], ["Pricing", "/#pricing"], ["Security", "/#security"]] },
  { title: "Solutions", links: [["Single school", "/#use-cases"], ["School chains", "/#multi-branch"], ["School website", "/school"], ["Parent app", "/#modules"]] },
  { title: "Company", links: [["Book a demo", "/#demo"], ["Contact", "/#demo"], ["FAQ", "/#faq"], ["Log in", "/login"]] },
  { title: "Legal", links: [["Privacy policy", "/privacy"], ["Terms of service", "/terms"], ["Refund policy", "/terms#refunds"], ["Data protection (DPDP)", "/privacy#dpdp"]] },
] as const;

export function MarketingFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <ProductLogo light />
            <p className="mt-4 text-sm leading-relaxed">
              School management software for Indian schools and school chains — admissions to alumni, fees to report cards, in one simple system.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex items-center gap-2"><Mail className="size-4 text-indigo-400" /><a href={`mailto:${PRODUCT.email}`} className="hover:text-white">{PRODUCT.email}</a></li>
              <li className="flex items-center gap-2"><Phone className="size-4 text-indigo-400" /><a href={`tel:${PRODUCT.phone.replace(/\s/g, "")}`} className="hover:text-white">{PRODUCT.phone}</a></li>
              <li className="flex items-center gap-2"><MapPin className="size-4 text-indigo-400" />{PRODUCT.address}</li>
            </ul>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-white">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("/#") ? <a href={href} className="hover:text-white">{label}</a> : <Link to={href} className="hover:text-white">{label}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-slate-800 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {PRODUCT.name}. All rights reserved.</p>
          <p>Made in India for Indian schools · Data hosted in India</p>
        </div>
      </div>
    </footer>
  );
}
