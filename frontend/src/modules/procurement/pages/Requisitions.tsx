import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ClipboardList, ExternalLink, PackagePlus, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { daysFromToday, today } from "@/lib/dates";
import { useInventorySettings, useItems } from "@/store/inventory";
import {
  INDENT_STEPS, inr, issueToRequester, purchaseEstimate, raiseIndent, useIndents, usePurchaseOrders,
  type Indent, type IndentLine, type IndentStatus, type Priority,
} from "@/store/procurement";
import { ErrorText, IndentLines, IndentProgress, IndentStatusBadge, IndentTimeline, useAction } from "../components";
import { ProcessRail, Quotations, STORE, StoreCheck, useRailSteps } from "../flow";

const VIEWS: { key: string; label: string; statuses: IndentStatus[] }[] = [
  { key: "open", label: "All open", statuses: ["PENDING_HOD", "PENDING_STORE", "PENDING_PRINCIPAL", "PENDING_MANAGEMENT", "APPROVED_FOR_PURCHASE", "PO_RAISED", "GOODS_RECEIVED"] },
  { key: "store", label: "Store check", statuses: ["PENDING_HOD", "PENDING_STORE"] },
  { key: "approval", label: "In approval", statuses: ["PENDING_PRINCIPAL", "PENDING_MANAGEMENT"] },
  { key: "quotes", label: "Quotations", statuses: ["APPROVED_FOR_PURCHASE"] },
  { key: "ordered", label: "Ordered", statuses: ["PO_RAISED"] },
  { key: "received", label: "To hand over", statuses: ["GOODS_RECEIVED"] },
  { key: "closed", label: "Closed", statuses: ["COMPLETED", "REJECTED", "CANCELLED"] },
];
const ACTIONABLE: IndentStatus[] = ["PENDING_STORE", "APPROVED_FOR_PURCHASE", "GOODS_RECEIVED"];
const stepOf = (i: Indent) => (i.status === "COMPLETED" ? INDENT_STEPS.length : Math.max(1, INDENT_STEPS.findIndex((s) => s.statuses.includes(i.status)) + 1));

/** Purchase requisitions (PR): everything asked for, where it is, and the store's next step. */
export function Requisitions() {
  const indents = useIndents();
  const orders = usePurchaseOrders();
  const rail = useRailSteps();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.key === params.get("view")) ?? VIEWS[0];
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState<null | "blank" | "reorder">(params.get("new") === "reorder" ? "reorder" : null);
  const open = indents.find((i) => i.id === openId) ?? null;

  const q = search.toLowerCase();
  const list = indents
    .filter((i) => view.statuses.includes(i.status) && (priority === "all" || i.priority === priority))
    .filter((i) => !q || `${i.no} ${i.requestedBy.name} ${i.department} ${i.location} ${i.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => Number(ACTIONABLE.includes(b.status)) - Number(ACTIONABLE.includes(a.status)) || (a.priority === "Urgent" ? -1 : 0) - (b.priority === "Urgent" ? -1 : 0) || a.neededBy.localeCompare(b.neededBy));
  const count = (key: string) => indents.filter((i) => VIEWS.find((v) => v.key === key)!.statuses.includes(i.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Requisitions (PR)" description="Every request to buy — from teachers, departments and the store itself. Check stock, get approval, compare quotations and order."
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => setCreating("reorder")}><RefreshCcw className="h-4 w-4" /> Reorder low stock</Button>
            <Button className="gap-2" onClick={() => setCreating("blank")}><Plus className="h-4 w-4" /> New PR</Button>
          </>
        } />
      <ProcessRail steps={rail} active={view.key === "approval" ? "approval" : view.key === "quotes" ? "quotes" : "pr"} />

      <Card className="gap-0">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" onClick={() => setParams(v.key === "open" ? {} : { view: v.key }, { replace: true })}
                className={cn("rounded-full border px-3 py-1 text-sm transition-colors", view.key === v.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>
                {v.label} <span className="ml-1 tabular-nums opacity-80">{count(v.key)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search PR no., item, requester, department…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}><SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Any priority</SelectItem><SelectItem value="Urgent">Urgent</SelectItem><SelectItem value="Normal">Normal</SelectItem></SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2.5 font-medium">PR</th><th className="px-4 py-2.5 font-medium">Items</th><th className="px-4 py-2.5 font-medium">Requested by</th><th className="px-4 py-2.5 font-medium">Needed by</th><th className="px-4 py-2.5 text-right font-medium">Estimate</th><th className="px-4 py-2.5 font-medium">Progress</th><th className="px-4 py-2.5 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((i) => {
                const late = !["COMPLETED", "REJECTED", "CANCELLED"].includes(i.status) && i.neededBy < today();
                const step = stepOf(i);
                return (
                  <tr key={i.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => setOpenId(i.id)}>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap font-mono text-xs font-medium text-foreground">{i.no}</p>
                      <p className="text-[11px] text-muted-foreground">{i.raisedOn}</p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate font-medium text-foreground">{i.lines.map((l) => l.name).join(", ")}</p>
                      <p className="text-xs text-muted-foreground">{i.lines.length} line{i.lines.length === 1 ? "" : "s"} · {i.location}</p>
                    </td>
                    <td className="px-4 py-3"><p className="text-foreground">{i.requestedBy.name}</p><p className="text-xs text-muted-foreground">{i.department}</p></td>
                    <td className="px-4 py-3">
                      <p className={cn(late && "font-medium text-red-600 dark:text-red-400")}>{i.neededBy}</p>
                      {i.priority === "Urgent" && <Badge variant="destructive" className="mt-0.5 h-5">Urgent</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{inr(purchaseEstimate(i))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">{INDENT_STEPS.map((s, n) => <span key={s.key} className={cn("h-1.5 w-4 rounded-full", ["REJECTED", "CANCELLED"].includes(i.status) ? "bg-red-400/40" : n < step ? "bg-primary" : "bg-muted")} />)}</div>
                        <span className="text-[11px] text-muted-foreground">{Math.min(step, INDENT_STEPS.length)}/{INDENT_STEPS.length}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <IndentStatusBadge status={i.status} />
                      {ACTIONABLE.includes(i.status) && <p className="mt-1 text-[11px] font-medium text-primary">Your action →</p>}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-2 h-6 w-6" />No requisitions here.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {open && <RequisitionDetail indent={open} poNo={orders.find((p) => p.id === open.poId)?.no} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
      {creating && <NewRequisition mode={creating} onClose={() => { setCreating(null); if (params.get("new")) setParams({}, { replace: true }); }} onCreated={(i) => setOpenId(i.id)} />}
    </div>
  );
}

function RequisitionDetail({ indent: i, poNo, onClose }: { indent: Indent; poNo?: string; onClose: () => void }) {
  const issue = useAction();
  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <SheetTitle className="font-mono">{i.no}</SheetTitle>
          <IndentStatusBadge status={i.status} />
          {i.priority === "Urgent" && <Badge variant="destructive">Urgent</Badge>}
        </div>
        <SheetDescription>{i.requestedBy.name} · {i.department} · for {i.location} · needed by {i.neededBy}</SheetDescription>
        <IndentProgress indent={i} />
      </SheetHeader>
      <div className="space-y-6 p-4">
        {i.status === "PENDING_STORE" && <ActionCard title="Store check" text="Give what is in stock now; the rest goes to the principal for approval."><StoreCheck indent={i} /></ActionCard>}
        {i.status === "APPROVED_FOR_PURCHASE" && <ActionCard title="Quotations → purchase order" text="Collect quotations from vendors, compare them side by side and create the PO."><Quotations indent={i} onDone={onClose} /></ActionCard>}
        {i.status === "GOODS_RECEIVED" && (
          <ActionCard title="Hand over" text={`Everything has arrived. Issue it to ${i.requestedBy.name} (stock out) to close the PR.`}>
            <Button disabled={issue.busy} onClick={() => issue.run(() => issueToRequester(i.id, STORE), () => toast.success(`${i.no} handed over`))}>Issue to {i.requestedBy.name}</Button>
            <ErrorText error={issue.error} />
          </ActionCard>
        )}
        {i.status === "PO_RAISED" && poNo && (
          <ActionCard title="Ordered" text={`Purchase order ${poNo} is with the vendor. Record the goods receipt (GRN) when the delivery comes.`}>
            <Button variant="outline" className="gap-2" asChild><Link to="/inventory/purchase-orders"><ExternalLink className="h-4 w-4" /> Open purchase orders</Link></Button>
          </ActionCard>
        )}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Items</h3>
          <p className="text-sm text-muted-foreground"><span className="text-foreground">Purpose:</span> {i.purpose}</p>
          <IndentLines indent={i} />
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">History</h3>
          <IndentTimeline indent={i} />
        </section>
      </div>
    </>
  );
}

function ActionCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-4">
      <div><h3 className="font-semibold text-foreground">{title}</h3><p className="text-sm text-muted-foreground">{text}</p></div>
      {children}
    </section>
  );
}

type Line = IndentLine & { key: number };

function NewRequisition({ mode, onClose, onCreated }: { mode: "blank" | "reorder"; onClose: () => void; onCreated: (i: Indent) => void }) {
  const items = useItems();
  const settings = useInventorySettings();
  const low = useMemo(() => items.filter((it) => it.quantity < it.minQuantity), [items]);
  const fromItem = (it: (typeof items)[number], key: number): Line => ({ key, name: it.name, qty: Math.max(1, it.minQuantity * 2 - it.quantity), unit: it.unit, estRate: it.unitPrice, itemId: it.id });
  const [form, setForm] = useState({ department: "Store", location: "Main store", purpose: "", priority: "Normal" as Priority, neededBy: daysFromToday(10) });
  const [lines, setLines] = useState<Line[]>([]);
  const { error, run, busy } = useAction();

  useEffect(() => {
    if (mode === "reorder") {
      setLines(low.map((it, n) => fromItem(it, n)));
      setForm((f) => ({ ...f, purpose: low.length ? `Replenish stock below minimum (${low.length} item${low.length === 1 ? "" : "s"})` : "" }));
    } else setLines([{ key: 0, name: "", qty: 1, unit: "pcs", estRate: 0 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.qty * l.estRate, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === "reorder" ? "Reorder low stock — new PR" : "New purchase requisition"}</DialogTitle></DialogHeader>
        {mode === "reorder" && low.length === 0 && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">Every item is above its minimum stock — nothing to reorder.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Needed at</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Main store, Chemistry lab…" /></div>
          <div className="space-y-1.5"><Label>Needed by</Label><Input type="date" min={today()} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Purpose / justification</Label><Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Why these items are needed" /></div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><Label>Items</Label>
            <div className="flex gap-2">
              <Select value="" onValueChange={(v) => { const it = items.find((x) => String(x.id) === v); if (it) setLines((ls) => [...ls.filter((l) => l.name.trim()), fromItem(it, Date.now())]); }}>
                <SelectTrigger className="h-8 w-52"><SelectValue placeholder="+ Add a stock item" /></SelectTrigger>
                <SelectContent>{items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.name} ({it.quantity} {it.unit})</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setLines((ls) => [...ls, { key: Date.now(), name: "", qty: 1, unit: "pcs", estRate: 0 }])}><PackagePlus className="h-4 w-4" /> New item</Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Item</th><th className="w-24 px-2 py-2 font-medium">Qty</th><th className="w-24 px-2 py-2 font-medium">Unit</th><th className="w-28 px-2 py-2 font-medium">Est. rate ₹</th><th className="w-28 px-2 py-2 text-right font-medium">Amount</th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => {
                  const stock = items.find((it) => it.id === l.itemId);
                  return (
                    <tr key={l.key}>
                      <td className="px-3 py-1.5">
                        <Input className="h-8" value={l.name} disabled={!!l.itemId} onChange={(e) => set(l.key, { name: e.target.value })} placeholder="Item name and specification" />
                        {stock && <p className="mt-0.5 text-[11px] text-muted-foreground">In stock {stock.quantity} · minimum {stock.minQuantity}</p>}
                      </td>
                      <td className="px-2 py-1.5"><Input className="h-8" type="number" min={1} value={l.qty} onChange={(e) => set(l.key, { qty: Math.max(1, Math.floor(Number(e.target.value))) })} /></td>
                      <td className="px-2 py-1.5"><Input className="h-8" value={l.unit} disabled={!!l.itemId} onChange={(e) => set(l.key, { unit: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input className="h-8" type="number" min={0} value={l.estRate} onChange={(e) => set(l.key, { estRate: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(l.qty * l.estRate)}</td>
                      <td className="px-1"><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Add items.</td></tr>}
              </tbody>
              <tfoot><tr className="border-t border-border"><td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">Estimated value</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{inr(total)}</td><td /></tr></tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Approval: principal up to the limit in procurement settings, management above it. Categories for new items: {settings.categories.map((c) => c.name).slice(0, 4).join(", ")}…</p>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !lines.length} onClick={() => run(async () => {
            const created = await raiseIndent({ ...form, lines: lines.map(({ key: _k, ...l }) => l) }, { role: STORE.role, name: STORE.name });
            toast.success(`${created.no} raised — now at store check`);
            onClose();
            onCreated(created);
          })}>Raise PR</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
