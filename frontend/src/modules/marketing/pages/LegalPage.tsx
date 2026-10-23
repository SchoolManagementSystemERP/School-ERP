import { useEffect } from "react";
import { PRODUCT } from "../content";
import { MarketingFooter, MarketingHeader } from "../MarketingChrome";

type Section = { id?: string; title: string; body: string[] };

const UPDATED = "1 October 2026";

const PRIVACY: Section[] = [
  { title: "Who we are", body: [`${PRODUCT.name} provides school management software to schools and school groups ("Schools"). For student, parent and staff data that a School enters into ${PRODUCT.name}, the School is the Data Fiduciary and we act as its Data Processor. For information you give us directly (for example when you book a demo), we are the Data Fiduciary.`] },
  { title: "What we collect", body: ["From schools: student, guardian and staff records, attendance, marks, fees and other information the School chooses to store.", "From website visitors: the details you submit in our forms (name, school, phone, email, city) and basic technical logs (IP address, browser) used for security."] },
  { title: "How we use it", body: ["To provide, secure and support the service for the School that engaged us.", "To respond to demo requests and enquiries.", "We never sell personal data and never use children's data for advertising or profiling."] },
  { title: "How we protect it", body: ["Each School's data is isolated at the database level, encrypted in transit (TLS) and protected by role-based access control.", "Sensitive identifiers such as Aadhaar and bank details are encrypted; only the last four digits of Aadhaar are stored in clear.", "Data is hosted in India with daily backups. Every change to important records is logged."] },
  { id: "dpdp", title: "Your rights under the DPDP Act, 2023", body: ["You may ask for access to, correction of, or erasure of your personal data, and withdraw consent where processing is based on consent.", "For a child's data, the School collects verifiable consent from a parent or lawful guardian. Requests about a student's data should be sent to the School, which we help to fulfil.", `Grievance Officer: ${PRODUCT.email} — we respond within 30 days.`] },
  { title: "Retention", body: ["We keep School data for as long as the School's subscription is active and for up to 90 days afterwards so it can be exported, after which it is deleted from live systems and from backups within the backup cycle."] },
  { title: "Contact", body: [`Questions about this policy: ${PRODUCT.email}, ${PRODUCT.address}.`] },
];

const TERMS: Section[] = [
  { title: "The service", body: [`These terms govern the use of ${PRODUCT.name} by Schools and their users. By subscribing, the School agrees to these terms on behalf of its users.`] },
  { title: "Accounts", body: ["The School is responsible for creating user accounts, assigning roles and keeping passwords confidential. Notify us promptly of any unauthorised use."] },
  { title: "Plans and payment", body: ["Fees are charged per campus per month or year as shown on our pricing page, plus applicable GST. Invoices are payable in advance.", "We may change prices with 60 days' notice; changes apply from the next billing period."] },
  { id: "refunds", title: "Trial, cancellation and refunds", body: ["New Schools get a 30-day free trial.", "You may cancel at any time; the service continues until the end of the paid period. Yearly plans cancelled within the first 30 days are refunded pro rata. Other payments are non-refundable."] },
  { title: "Your data", body: ["The School owns its data. You can export it at any time in standard formats. We process it only to provide the service, as described in our Privacy Policy."] },
  { title: "Acceptable use", body: ["Do not misuse the service, attempt to access other Schools' data, upload unlawful content or interfere with the platform's security."] },
  { title: "Availability and support", body: ["We aim for 99.5% monthly availability, excluding planned maintenance announced in advance. Support is available on working days during school hours."] },
  { title: "Liability", body: ["To the extent permitted by law, our total liability is limited to the fees paid by the School in the twelve months before the claim."] },
  { title: "Governing law", body: ["These terms are governed by the laws of India. Courts at Lucknow, Uttar Pradesh have exclusive jurisdiction."] },
];

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const title = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
  const sections = kind === "privacy" ? PRIVACY : TERMS;

  useEffect(() => {
    document.title = `${title} — ${PRODUCT.name}`;
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingHeader onHome={false} />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-sm font-semibold text-indigo-600">Legal</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {UPDATED}</p>
        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.title} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-xl font-semibold text-slate-900">{i + 1}. {s.title}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-slate-700">
                {s.body.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
