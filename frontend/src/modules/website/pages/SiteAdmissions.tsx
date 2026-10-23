import { useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Download, FileCheck2, Loader2, Send } from "lucide-react";
import { submitWebsiteEnquiry, usePublicFees } from "@/store/publicSite";
import { useSite } from "@/store/website";
import { PageHero, SectionTitle, siteInput } from "../SiteLayout";
import { ADMISSION_DATES, ADMISSION_DOCUMENTS, ADMISSION_STEPS, AGE_CRITERIA, FAQ_ADMISSION, ONE_TIME_FEES } from "../siteContent";
import { downloadFile, printableDoc } from "../siteUtils";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const CLASSES = ["Nursery", "LKG", "UKG", ...Array.from({ length: 11 }, (_, i) => `Class ${i + 1}`)];

const EMPTY = { studentName: "", parentName: "", phone: "", email: "", grade: "Nursery", dob: "", currentSchool: "", needsTransport: "No", message: "", consent: false };

function EnquiryForm() {
  const site = useSite();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.studentName.trim().length < 2) e.studentName = "Enter the child's name";
    if (f.parentName.trim().length < 2) e.parentName = "Enter the parent's name";
    if (!/^[+]?[0-9\s-]{10,15}$/.test(f.phone.trim())) e.phone = "Enter a valid mobile number";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email";
    if (!f.consent) e.consent = "Please accept to be contacted";
    setErrors(e);
    if (Object.keys(e).length) return;

    setState("sending");
    void (async () => {
      const notes = [
        f.dob && `DOB ${f.dob}`,
        f.currentSchool && `Current school: ${f.currentSchool}`,
        f.needsTransport === "Yes" && "Needs transport",
        f.message,
      ].filter(Boolean).join(" · ");
      const ok = await submitWebsiteEnquiry({
        studentName: f.studentName.trim(), parentName: f.parentName.trim(), phone: f.phone.trim(), email: f.email.trim(),
        grade: f.grade.replace("Class ", ""), notes,
      });
      setState(ok ? "done" : "idle");
    })();
  }

  if (state === "done") {
    return (
      <div className="rounded-3xl bg-white p-10 text-center shadow-xl ring-1 ring-slate-200">
        <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
        <h3 className="mt-4 font-display text-2xl font-bold text-blue-950">Enquiry received</h3>
        <p className="mx-auto mt-2 max-w-md text-slate-600">Thank you, {f.parentName.split(" ")[0]}. Our admissions team will call you on <b>{f.phone}</b> within one working day about {f.studentName}'s admission to {f.grade}.</p>
        <button type="button" onClick={() => { setF(EMPTY); setState("idle"); }} className="mt-6 font-semibold text-blue-900 hover:text-amber-600">Submit another enquiry</button>
      </div>
    );
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs font-medium text-rose-600">{errors[k]}</p>;
  const lbl = "mb-1.5 block text-sm font-medium text-slate-700";
  return (
    <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">
      <h3 className="font-display text-2xl font-bold text-blue-950">Admission enquiry {site.admissionYear}</h3>
      <p className="mt-1 text-sm text-slate-500">Fields marked * are required.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label><span className={lbl}>Child's name *</span><input className={siteInput} value={f.studentName} onChange={set("studentName")} />{err("studentName")}</label>
        <label><span className={lbl}>Class applying for *</span><select className={siteInput} value={f.grade} onChange={set("grade")}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label><span className={lbl}>Date of birth</span><input type="date" className={siteInput} value={f.dob} onChange={set("dob")} /></label>
        <label><span className={lbl}>Current school</span><input className={siteInput} value={f.currentSchool} onChange={set("currentSchool")} /></label>
        <label><span className={lbl}>Parent's name *</span><input className={siteInput} value={f.parentName} onChange={set("parentName")} autoComplete="name" />{err("parentName")}</label>
        <label><span className={lbl}>Mobile number *</span><input className={siteInput} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" />{err("phone")}</label>
        <label><span className={lbl}>Email</span><input type="email" className={siteInput} value={f.email} onChange={set("email")} autoComplete="email" />{err("email")}</label>
        <label><span className={lbl}>School transport needed?</span><select className={siteInput} value={f.needsTransport} onChange={set("needsTransport")}><option>No</option><option>Yes</option></select></label>
        <label className="sm:col-span-2"><span className={lbl}>Questions or message</span><textarea className={`${siteInput} min-h-24`} value={f.message} onChange={set("message")} /></label>
        <label className="flex items-start gap-2.5 text-sm text-slate-600 sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-blue-900" checked={f.consent} onChange={(e) => setF((x) => ({ ...x, consent: e.target.checked }))} />
          <span>I agree to be contacted by the school about admission by phone, SMS, WhatsApp or email.{err("consent")}</span>
        </label>
      </div>
      <button type="submit" disabled={state === "sending" || !site.admissionsOpen} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-900 disabled:opacity-60">
        {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {site.admissionsOpen ? "Submit enquiry" : "Admissions are currently closed"}
      </button>
    </form>
  );
}

export function SiteAdmissions() {
  const site = useSite();
  const feePlan = usePublicFees();
  const [faq, setFaq] = useState<number | null>(null);
  const feeRows = Object.entries(feePlan).map(([g, amt]) => ({ grade: Number(g), annual: amt })).sort((a, b) => a.grade - b.grade);

  function downloadProspectus() {
    downloadFile(`${site.shortName}-prospectus.html`, printableDoc(`Prospectus ${site.admissionYear}`, site.name, [
      { heading: "About the school", lines: site.about.split("\n").filter(Boolean) },
      { heading: "Admission process", lines: ADMISSION_STEPS.map((s, i) => `${i + 1}. ${s.title} — ${s.text}`) },
      { heading: "Age criteria", lines: AGE_CRITERIA.map((a) => `${a.cls}: ${a.age}`) },
      { heading: "Documents required", lines: ADMISSION_DOCUMENTS },
      { heading: "Annual tuition fee", lines: feeRows.map((r) => `Class ${r.grade}: ${inr(r.annual)} (3 installments)`) },
      { heading: "One-time fees", lines: ONE_TIME_FEES.map((f) => `${f.head}: ${inr(f.amount)}`) },
      { heading: "Contact", lines: [`${site.address}, ${site.city} ${site.pincode}`, site.phone, site.email] },
    ]));
  }

  return (
    <>
      <PageHero title={`Admissions ${site.admissionYear}`} crumb="Admissions" subtitle={site.admissionsOpen ? "Registrations are open. We'd love to welcome your child to our school family." : "Admissions for the coming session will open soon. Leave an enquiry and we'll keep you informed."} />

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="How to apply" title="Admission process" />
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {ADMISSION_STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl p-5 ring-1 ring-slate-200">
                <span className="grid size-10 place-items-center rounded-full bg-amber-400 font-display font-bold text-blue-950">{i + 1}</span>
                <p className="mt-3 font-display text-lg font-semibold text-blue-950">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#enquiry" className="rounded-xl bg-blue-950 px-6 py-3 text-center font-semibold text-white hover:bg-blue-900">Fill the enquiry form</a>
            <button type="button" onClick={downloadProspectus} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-blue-950 px-6 py-3 font-semibold text-blue-950 hover:bg-blue-50"><Download className="size-4" />Download prospectus</button>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-display text-xl font-bold text-blue-950">Age criteria</h2>
            <table className="mt-4 w-full text-sm">
              <tbody>{AGE_CRITERIA.map((a) => <tr key={a.cls} className="border-b border-slate-100 last:border-0"><td className="py-2.5 font-medium text-slate-800">{a.cls}</td><td className="py-2.5 text-right text-slate-600">{a.age}</td></tr>)}</tbody>
            </table>
            <p className="mt-4 text-sm text-slate-500">Class 2 onwards: on the basis of the previous class result and a short assessment, subject to seat availability.</p>
          </div>
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-blue-950"><FileCheck2 className="size-5 text-amber-500" />Documents required</h2>
            <ul className="mt-4 space-y-2">{ADMISSION_DOCUMENTS.map((d) => <li key={d} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />{d}</li>)}</ul>
          </div>
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-blue-950"><CalendarDays className="size-5 text-amber-500" />Important dates</h2>
            <ul className="mt-4 divide-y divide-slate-100">{ADMISSION_DATES.map((d) => <li key={d.what} className="flex justify-between gap-4 py-2.5 text-sm"><span className="text-slate-700">{d.what}</span><span className="shrink-0 font-semibold text-blue-950">{d.when}</span></li>)}</ul>
          </div>
        </div>
      </section>

      <section id="fees" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle eyebrow="Fee structure" title={`Fees for ${site.admissionYear}`} text="Tuition is payable in three installments (April, September, December). Pay online through the parent app with UPI, cards or net banking." />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
              <table className="w-full min-w-[460px] text-left text-sm">
                <thead className="bg-blue-950 text-white"><tr><th className="px-5 py-3.5">Class</th><th className="px-5 py-3.5 text-right">Annual tuition</th><th className="px-5 py-3.5 text-right">Per installment</th></tr></thead>
                <tbody>
                  {feeRows.map((r) => (
                    <tr key={r.grade} className="border-t border-slate-100"><td className="px-5 py-3 font-medium text-slate-800">Class {r.grade}</td><td className="px-5 py-3 text-right font-semibold text-blue-950">{inr(r.annual)}</td><td className="px-5 py-3 text-right text-slate-600">≈ {inr(Math.round(r.annual / 3))}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">Fees for other classes are available at the admissions office. Transport and hostel fees are charged separately.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
              <p className="font-display text-lg font-bold text-blue-950">One-time fees</p>
              <ul className="mt-3 divide-y divide-amber-200/60">{ONE_TIME_FEES.map((f) => <li key={f.head} className="flex justify-between py-2.5 text-sm"><span className="text-slate-700">{f.head}</span><span className="font-semibold text-blue-950">{inr(f.amount)}</span></li>)}</ul>
              <p className="mt-4 text-sm font-semibold text-blue-950">Concessions</p>
              <p className="mt-1 text-sm text-slate-600">Second child 10% · Third child 15% · Merit and EWS concessions as per policy · RTE seats as per government norms.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="enquiry" className="scroll-mt-24 bg-gradient-to-br from-blue-950 to-indigo-900 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="text-white">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Enquire now</p>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Take the first step</h2>
            <p className="mt-4 text-lg text-blue-100">Fill in the form and our admissions counsellor will call you to answer your questions and invite you for a campus visit.</p>
            <div className="mt-8 space-y-3">
              {FAQ_ADMISSION.map((q, i) => (
                <div key={q.q} className="rounded-xl bg-white/5 ring-1 ring-white/10">
                  <button type="button" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold">
                    {q.q}<ChevronDown className={`size-4 shrink-0 transition ${faq === i ? "rotate-180" : ""}`} />
                  </button>
                  {faq === i && <p className="px-4 pb-4 text-sm text-blue-100">{q.a}</p>}
                </div>
              ))}
            </div>
          </div>
          <EnquiryForm />
        </div>
      </section>
    </>
  );
}
