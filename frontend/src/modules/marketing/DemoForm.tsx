import { useState, type FormEvent } from "react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import { addLead } from "@/store/website";

const EMPTY = { name: "", institution: "", role: "Principal", phone: "", email: "", city: "", branches: "1", students: "500 – 1,000", message: "" };
type Field = keyof typeof EMPTY;

const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15";

export function DemoForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const set = (k: Field) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e: Partial<Record<Field, string>> = {};
    if (form.name.trim().length < 2) e.name = "Please enter your name";
    if (form.institution.trim().length < 3) e.institution = "Please enter your school or group name";
    if (!/^[+]?[0-9\s-]{10,15}$/.test(form.phone.trim())) e.phone = "Enter a valid mobile number";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Enter a valid email";
    if (form.city.trim().length < 2) e.city = "Please enter your city";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setState("sending");
    void addLead({ ...form, name: form.name.trim(), institution: form.institution.trim(), phone: form.phone.trim(), email: form.email.trim(), city: form.city.trim(), message: form.message.trim() })
      .then((ok) => setState(ok ? "done" : "idle"));
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-10 text-center shadow-2xl">
        <span className="grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="size-9" /></span>
        <h3 className="mt-5 font-display text-2xl font-bold text-slate-900">Thank you, {form.name.split(" ")[0]}!</h3>
        <p className="mt-2 max-w-sm text-slate-600">We've received your request. Our team will call you on <b>{form.phone}</b> within one working day to fix a demo time.</p>
        <button type="button" onClick={() => { setForm(EMPTY); setState("idle"); }} className="mt-6 text-sm font-semibold text-indigo-600 hover:text-indigo-700">Send another request</button>
      </div>
    );
  }

  const err = (k: Field) => errors[k] && <p className="mt-1 text-xs font-medium text-rose-600">{errors[k]}</p>;
  return (
    <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600"><CalendarCheck className="size-5" /></span>
        <div>
          <p className="font-display text-lg font-bold text-slate-900">Request a demo</p>
          <p className="text-sm text-slate-500">Takes 30 seconds · No obligation</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1.5 block font-medium text-slate-700">Your name *</span><input className={input} value={form.name} onChange={set("name")} autoComplete="name" />{err("name")}</label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">You are</span>
          <select className={input} value={form.role} onChange={set("role")}>
            {["Principal", "Owner / Trustee", "Director", "Administrator", "IT / Office staff", "Teacher", "Other"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1.5 block font-medium text-slate-700">School / group name *</span><input className={input} value={form.institution} onChange={set("institution")} autoComplete="organization" />{err("institution")}</label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium text-slate-700">Mobile number *</span><input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="98765 43210" />{err("phone")}</label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium text-slate-700">Email</span><input className={input} value={form.email} onChange={set("email")} type="email" autoComplete="email" />{err("email")}</label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium text-slate-700">City *</span><input className={input} value={form.city} onChange={set("city")} autoComplete="address-level2" />{err("city")}</label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">Number of campuses</span>
          <select className={input} value={form.branches} onChange={set("branches")}>
            {["1", "2 – 5", "6 – 20", "20+"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block font-medium text-slate-700">Students (total)</span>
          <select className={input} value={form.students} onChange={set("students")}>
            {["Under 500", "500 – 1,000", "1,000 – 3,000", "3,000 – 10,000", "10,000+"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1.5 block font-medium text-slate-700">What would you like to see?</span><textarea className={`${input} min-h-[88px]`} value={form.message} onChange={set("message")} placeholder="e.g. online fees, report cards, multiple branches" /></label>
      </div>
      <button type="submit" disabled={state === "sending"} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 disabled:opacity-70">
        {state === "sending" && <Loader2 className="size-4 animate-spin" />} Book my free demo
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">By submitting you agree to be contacted about SchoolERP. See our <a href="/privacy" className="underline">privacy policy</a>.</p>
    </form>
  );
}
