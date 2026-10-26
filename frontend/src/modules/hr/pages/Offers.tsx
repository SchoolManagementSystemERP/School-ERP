import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Copy, FileSignature, Printer, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { CtcTable, offerLetterHtml, type OfferForLetter } from "@/components/hr/hrDocs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { fmtDate, rupees } from "@/lib/format";
import { printDocument } from "@/lib/print";
import { act, useApi } from "@/lib/useApi";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
interface Offer extends OfferForLetter { id: string; applicationId: string; staffType: string; status: Status; staffId: string | null; respondedAt: string | null }
interface OffersResponse { branches: { id: string; name: string; address: string | null; city: string | null }[]; offers: Offer[] }

const STATUS: Record<Status, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  SENT: { label: "Sent — awaiting reply", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ACCEPTED: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  DECLINED: { label: "Declined", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-muted-foreground line-through" },
};
const NON_TEACHING_ROLES = ["RECEPTIONIST", "ACCOUNTANT", "LIBRARIAN", "HR", "INVENTORY_MANAGER", "TRANSPORT_MANAGER", "HOSTEL_WARDEN", "EXAM_CONTROLLER"];

/** Offer letters: print with the CTC annexure, send, record the answer, and convert the candidate into an employee. */
export function Offers() {
  const { data, reload } = useApi<OffersResponse>("/offers");
  const [open, setOpen] = useState<Offer | null>(null);
  const [joining, setJoining] = useState<Offer | null>(null);
  const [join, setJoin] = useState({ createLogin: true, roleCode: "", employeeCode: "" });
  const [joined, setJoined] = useState<{ name: string; employeeCode: string; temporaryPassword: string | null } | null>(null);

  const offers = data?.offers ?? [];
  const school = data?.branches[0] ?? { name: "School", address: null, city: null };
  const print = (o: Offer) => printDocument(`Offer letter ${o.letterNo}`, offerLetterHtml(o, { name: school.name, address: school.address ?? undefined, city: school.city ?? undefined }));
  const setStatus = async (o: Offer, status: Status, msg: string) => {
    if (await act(() => api.patch(`/offers/${o.id}`, { status }), msg)) { setOpen(null); void reload(); }
  };
  const doJoin = async () => {
    if (!joining) return;
    const body = { createLogin: join.createLogin, ...(join.roleCode ? { roleCode: join.roleCode } : {}), ...(join.employeeCode.trim() ? { employeeCode: join.employeeCode.trim() } : {}) };
    const r = await act(() => api.post<{ staffId: string; employeeCode: string; temporaryPassword: string | null }>(`/offers/${joining.id}/join`, body), (x) => `${joining.candidate?.name} joined as ${x.employeeCode}`);
    if (r) { setJoined({ name: joining.candidate?.name ?? "", employeeCode: r.employeeCode, temporaryPassword: r.temporaryPassword }); setJoining(null); void reload(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Offer Letters" description="Offers with the CTC annexure. When the candidate accepts and reports, “Joined” creates the employee — code, sign-in, payroll and the onboarding checklist."
        actions={<Button variant="outline" className="gap-2" asChild><Link to="/hr/recruitment"><ArrowLeft className="h-4 w-4" /> Recruitment</Link></Button>} />
      <MiniStats items={[
        { label: "Awaiting reply", value: offers.filter((o) => o.status === "SENT").length, icon: Clock, tone: "blue" },
        { label: "Accepted, yet to join", value: offers.filter((o) => o.status === "ACCEPTED" && !o.staffId).length, icon: CheckCircle2, tone: "green" },
        { label: "Declined", value: offers.filter((o) => o.status === "DECLINED").length, icon: XCircle, tone: "red" },
      ]} />

      <div className="space-y-3">
        {offers.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No offers yet. Make one from Recruitment → “Screen · Interview · Offer” once the candidate passes every round.</CardContent></Card>}
        {offers.map((o) => {
          const expired = o.status === "SENT" && o.validTill < today();
          return (
            <Card key={o.id} className="gap-0">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{o.candidate?.name}</p>
                    <Badge variant="secondary" className={cn(STATUS[o.status].className)}>{o.staffId ? "Joined" : STATUS[o.status].label}</Badge>
                    {expired && <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Expired</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{o.designation} · {o.department} · CTC {rupees(o.ctcAnnual)} / year</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.letterNo} · joining {fmtDate(o.joiningDate)} · valid till {fmtDate(o.validTill)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(o)}><FileSignature className="h-4 w-4" /> View</Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => print(o)}><Printer className="h-4 w-4" /> Print</Button>
                  {o.status === "DRAFT" && <Button size="sm" className="gap-1" onClick={() => setStatus(o, "SENT", "Marked as sent")}><Send className="h-4 w-4" /> Mark sent</Button>}
                  {o.status === "SENT" && !expired && <Button size="sm" className="gap-1" onClick={() => setStatus(o, "ACCEPTED", `${o.candidate?.name} accepted the offer`)}><CheckCircle2 className="h-4 w-4" /> Accepted</Button>}
                  {o.status === "ACCEPTED" && !o.staffId && (
                    <Button size="sm" className="gap-1" onClick={() => { setJoining(o); setJoin({ createLogin: true, roleCode: o.staffType === "TEACHING" ? "TEACHER" : "", employeeCode: "" }); }}><UserCheck className="h-4 w-4" /> Joined</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.letterNo} — {open?.candidate?.name}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{open.designation} · {open.department} · {open.employmentType.toLowerCase().replace("_", "-")} · joining {fmtDate(open.joiningDate)}</p>
              <CtcTable b={open.breakdown} />
              <div className="flex flex-wrap justify-end gap-2">
                {(open.status === "DRAFT" || open.status === "SENT" || (open.status === "ACCEPTED" && !open.staffId)) && (
                  <Button variant="outline" className="text-red-600" onClick={() => setStatus(open, "WITHDRAWN", "Offer withdrawn")}>Withdraw</Button>
                )}
                {open.status === "SENT" && <Button variant="outline" onClick={() => setStatus(open, "DECLINED", "Marked as declined")}>Declined</Button>}
                <Button className="gap-1" onClick={() => print(open)}><Printer className="h-4 w-4" /> Print letter & annexure</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!joining} onOpenChange={(v) => !v && setJoining(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{joining?.candidate?.name} has joined</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Creates the employee record with the salary structure from the offer, and the joining checklist on the Onboarding page.</p>
            <div className="space-y-1.5"><Label>Employee code</Label><Input placeholder="Next free code (automatic)" value={join.employeeCode} onChange={(e) => setJoin({ ...join, employeeCode: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={join.createLogin} onCheckedChange={(v) => setJoin({ ...join, createLogin: v })} /> Create an ERP sign-in</label>
            {join.createLogin && joining?.staffType !== "TEACHING" && (
              <div className="space-y-1.5"><Label>Role</Label>
                <Select value={join.roleCode} onValueChange={(v) => setJoin({ ...join, roleCode: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose the role" /></SelectTrigger>
                  <SelectContent>{NON_TEACHING_ROLES.map((r) => <SelectItem key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setJoining(null)}>Cancel</Button><Button onClick={doJoin} disabled={join.createLogin && !join.roleCode}>Create employee</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!joined} onOpenChange={(v) => !v && setJoined(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Welcome aboard, {joined?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Employee code: <strong>{joined?.employeeCode}</strong></p>
            {joined?.temporaryPassword ? (
              <>
                <p>Sign-in: username <strong>{joined.employeeCode}</strong>, temporary password:</p>
                <div className="flex items-center gap-2 rounded-md bg-muted p-2 font-mono">
                  <span className="flex-1">{joined.temporaryPassword}</span>
                  <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(joined.temporaryPassword!); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground">Shown only once. They must change it at first sign-in.</p>
              </>
            ) : <p className="text-muted-foreground">No sign-in was created.</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" asChild><Link to="/hr/onboarding">Open onboarding</Link></Button><Button onClick={() => setJoined(null)}>Done</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
