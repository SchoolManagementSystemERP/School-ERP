import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { useSite } from "@/store/website";
import { PageHero } from "../SiteLayout";
import { DISCLOSURE, RESULTS } from "../siteContent";

function Block({ letter, title, children }: { letter: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 font-display text-lg font-bold text-blue-950">
        <span className="grid size-8 place-items-center rounded-lg bg-blue-950 text-sm text-amber-300">{letter}</span>{title}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function KeyValueTable({ rows }: { rows: (string | number)[][] }) {
  return (
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead className="bg-slate-50 text-slate-600"><tr><th className="w-16 px-6 py-3">S.No.</th><th className="px-6 py-3">Information</th><th className="px-6 py-3">Details</th></tr></thead>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={String(k)} className="border-t border-slate-100"><td className="px-6 py-3 text-slate-500">{i + 1}</td><td className="px-6 py-3 text-slate-700">{k}</td><td className="px-6 py-3 font-medium text-slate-900">{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function DocumentTable({ docs }: { docs: string[] }) {
  return (
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead className="bg-slate-50 text-slate-600"><tr><th className="w-16 px-6 py-3">S.No.</th><th className="px-6 py-3">Document</th><th className="px-6 py-3">Status</th></tr></thead>
      <tbody>
        {docs.map((d, i) => (
          <tr key={d} className="border-t border-slate-100">
            <td className="px-6 py-3 text-slate-500">{i + 1}</td>
            <td className="px-6 py-3 text-slate-700">{d}</td>
            <td className="px-6 py-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><FileText className="size-3.5" />Available at school office</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SiteDisclosure() {
  const site = useSite();
  return (
    <>
      <PageHero title="Mandatory Public Disclosure" crumb="Mandatory Disclosure" subtitle={`As required by ${site.board} under Appendix IX of the Affiliation Bye-Laws.`} />
      <div className="bg-slate-50 py-14">
        <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
          <Block letter="A" title="General information">
            <KeyValueTable rows={[
              ["Name of the school", site.name],
              ["Affiliation number", site.affiliationNo],
              ["School code", site.schoolCode],
              ["Complete address with pin code", `${site.address}, ${site.city}, ${site.state} ${site.pincode}`],
              ["Principal name", site.principalName],
              ["Principal qualification", site.principalQualification],
              ["School email ID", site.email],
              ["Contact details (landline / mobile)", site.phone],
            ]} />
          </Block>
          <Block letter="B" title="Documents and information"><DocumentTable docs={DISCLOSURE.documents} /></Block>
          <Block letter="C" title="Result and academics"><DocumentTable docs={DISCLOSURE.academics} /></Block>
          <Block letter="D" title="Staff (teaching)"><KeyValueTable rows={DISCLOSURE.staff} /></Block>
          <Block letter="E" title="School infrastructure"><KeyValueTable rows={DISCLOSURE.infrastructure} /></Block>
          <Block letter="F" title="School Management Committee (SMC)">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="w-16 px-6 py-3">S.No.</th><th className="px-6 py-3">Name</th><th className="px-6 py-3">Designation</th><th className="px-6 py-3">Role in SMC</th></tr></thead>
              <tbody>
                {DISCLOSURE.smc.map(([n, d, r], i) => (
                  <tr key={n} className="border-t border-slate-100"><td className="px-6 py-3 text-slate-500">{i + 1}</td><td className="px-6 py-3 font-medium text-slate-900">{n}</td><td className="px-6 py-3 text-slate-700">{d}</td><td className="px-6 py-3 text-slate-700">{r}</td></tr>
                ))}
              </tbody>
            </table>
          </Block>
          <Block letter="G" title="Board examination results (last three years)">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-6 py-3">Year</th><th className="px-6 py-3">Class X pass %</th><th className="px-6 py-3">Class XII pass %</th><th className="px-6 py-3">Remarks</th></tr></thead>
              <tbody>
                {RESULTS.map((r) => (
                  <tr key={r.year} className="border-t border-slate-100"><td className="px-6 py-3 font-medium text-slate-900">{r.year}</td><td className="px-6 py-3">{r.c10}</td><td className="px-6 py-3">{r.c12}</td><td className="px-6 py-3 text-slate-600">Avg. X {r.c10avg} · XII {r.c12avg}</td></tr>
                ))}
              </tbody>
            </table>
          </Block>
          <p className="text-center text-sm text-slate-500">Copies of the documents above can be inspected at the school office during working hours ({site.officeHours}).</p>
        </div>
      </div>
    </>
  );
}
