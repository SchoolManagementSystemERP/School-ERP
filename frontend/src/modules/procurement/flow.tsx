/**
 * The store's steps of the purchase flow, shared by the PR, PO and GRN pages: store check, quotations →
 * purchase order, goods receipt, the vendor form, and the printable PO / GRN documents.
 */
import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ClipboardList, FileCheck2, FileText, Landmark, PackageCheck, Plus, ShoppingCart, Stamp, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";
import { daysFromToday, today } from "@/lib/dates";
import { escapeHtml as e, inrText } from "@/lib/print";
import { useInventorySettings, useItems } from "@/store/inventory";
import {
  accountsStage, addQuotation, inr, purchaseEstimate, quotationTotal, raisePurchaseOrder, receiveGoods, receivedValue, removeQuotation, round2, saveVendor, storeCheck,
  useIndents, useProcurementSettings, usePurchaseOrders, useQuotations, useVendors,
  type GoodsReceipt, type Indent, type PurchaseOrder, type TdsSection, type Vendor,
} from "@/store/procurement";
import { ErrorText, useAction } from "./components";

export const STORE = { role: "inventory", name: "Store In-charge" };

export const PO_STATUS: Record<PurchaseOrder["status"], { label: string; className: string }> = {
  SENT: { label: "Sent to vendor", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  PARTIALLY_RECEIVED: { label: "Partly received", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  RECEIVED: { label: "Fully received", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

// ── The process rail: PR → … → paid, with live counts ─────────────────────────

export interface RailStep { key: string; label: string; count: number; hint?: string; href: string; icon: typeof ClipboardList }

/** The whole purchase process on one line, each step a link with how many items wait there. */
export function ProcessRail({ steps, active }: { steps: RailStep[]; active?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <ol className="flex min-w-[820px] items-stretch">
        {steps.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 items-center">
            <Link to={s.href} className={cn("group flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 transition-colors hover:bg-accent", active === s.key && "bg-primary/5")}>
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", s.count ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <s.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{i + 1}. {s.label}</span>
                <span className="block text-lg font-semibold leading-tight text-foreground">{s.count}</span>
                {s.hint && <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>}
              </span>
            </Link>
            {i < steps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Counts for the process rail, from the stores. */
export function useRailSteps(): RailStep[] {
  const indents = useIndents();
  const withAccounts = usePurchaseOrders().filter((p) => p.status !== "CANCELLED" && !["AWAITING_GOODS", "PAID"].includes(accountsStage(p))).length;
  const pending = (s: Indent["status"][]) => indents.filter((i) => s.includes(i.status)).length;
  return [
    { key: "pr", label: "PR", count: pending(["PENDING_HOD", "PENDING_STORE"]), hint: "Store check", href: "/inventory/requisitions?view=store", icon: ClipboardList },
    { key: "approval", label: "Approval", count: pending(["PENDING_PRINCIPAL", "PENDING_MANAGEMENT"]), hint: "Principal / mgmt", href: "/inventory/requisitions?view=approval", icon: Stamp },
    { key: "quotes", label: "Quotations", count: pending(["APPROVED_FOR_PURCHASE"]), hint: "Compare & choose", href: "/inventory/requisitions?view=quotes", icon: FileText },
    { key: "po", label: "PO", count: pending(["PO_RAISED"]), hint: "With the vendor", href: "/inventory/purchase-orders", icon: ShoppingCart },
    { key: "grn", label: "GRN", count: pending(["GOODS_RECEIVED"]), hint: "Hand over", href: "/inventory/goods-receipts", icon: PackageCheck },
    { key: "accounts", label: "Accounts", count: withAccounts, hint: "Bill & payment", href: "/inventory/goods-receipts?view=accounts", icon: Landmark },
  ];
}

// ── Store check ───────────────────────────────────────────────────────────────

export function StoreCheck({ indent, onDone }: { indent: Indent; onDone?: () => void }) {
  const items = useItems();
  const settings = useInventorySettings();
  // a sensible category for new items: one that shares a word with where they are needed ("Chemistry Lab" → "Lab Equipment")
  const words = `${indent.location} ${indent.department}`.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const guess = settings.categories.find((c) => c.name.toLowerCase().split(/\W+/).some((w) => words.includes(w)))?.name ?? settings.categories[0]?.name ?? "General";
  // the store's own reorder buys stock; it never issues from it
  const reorder = indent.history[0]?.role === "Store";
  const [rows, setRows] = useState(() =>
    indent.lines.map((l) => {
      const item = items.find((it) => it.id === l.itemId);
      return { itemId: l.itemId, category: l.category ?? guess, issue: item && !reorder ? Math.min(item.quantity, l.qty) : 0, estRate: l.estRate || item?.unitPrice || 0 };
    }),
  );
  const [remark, setRemark] = useState("");
  const { error, run, busy } = useAction();
  const set = (n: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const toBuy = indent.lines.reduce((s, l, n) => s + (l.qty - rows[n].issue) * rows[n].estRate, 0);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {indent.lines.map((l, n) => {
          const item = items.find((it) => it.id === rows[n].itemId);
          const buy = Math.max(0, l.qty - rows[n].issue);
          return (
            <div key={n} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-foreground">{l.name} <span className="font-normal text-muted-foreground">· asked {l.qty} {l.unit}</span></p>
                <Pill className={buy ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}>{buy ? `Buy ${buy}` : "All from stock"}</Pill>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_0.7fr_0.7fr]">
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <Label className="text-xs">Store item</Label>
                  <Select value={rows[n].itemId ? String(rows[n].itemId) : "new"} onValueChange={(v) => { const it = items.find((x) => String(x.id) === v); set(n, { itemId: it?.id, issue: it ? Math.min(it.quantity, l.qty) : 0, estRate: rows[n].estRate || it?.unitPrice || 0 }); }}>
                    <SelectTrigger className="h-8" aria-label="Store item"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Not stocked — new item</SelectItem>
                      {items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.name} · {it.quantity} {it.unit} in stock</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!item && (
                    <Select value={rows[n].category} onValueChange={(v) => set(n, { category: v })}>
                      <SelectTrigger className="h-8" aria-label="Category for the new item"><SelectValue /></SelectTrigger>
                      <SelectContent>{settings.categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1"><Label className="text-xs">Issue from stock</Label><Input className="h-8" type="number" min={0} max={item ? Math.min(item.quantity, l.qty) : 0} disabled={!item || reorder} value={rows[n].issue} onChange={(ev) => set(n, { issue: Math.max(0, Math.min(item ? Math.min(item.quantity, l.qty) : 0, Math.floor(Number(ev.target.value)))) })} /></div>
                <div className="space-y-1"><Label className="text-xs">Est. rate ₹</Label><Input className="h-8" type="number" min={0} value={rows[n].estRate} onChange={(ev) => set(n, { estRate: Number(ev.target.value) })} /></div>
              </div>
            </div>
          );
        })}
      </div>
      <Input placeholder="Remark for the principal (optional)" value={remark} onChange={(ev) => setRemark(ev.target.value)} aria-label="Remark" />
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">{toBuy > 0 ? <>To purchase: <strong className="text-foreground">{inr(round2(toBuy))}</strong> — goes for approval</> : "Everything can be given from stock."}</p>
        <Button disabled={busy} onClick={() => run(() => storeCheck(indent.id, STORE, rows, remark), () => { toast.success(toBuy > 0 ? `${indent.no}: stock issued, rest sent for approval` : `${indent.no}: issued from stock`); onDone?.(); })}>
          {toBuy > 0 ? "Issue & send for approval" : "Issue & close"}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

// ── Quotations → purchase order ───────────────────────────────────────────────

export function Quotations({ indent, onDone }: { indent: Indent; onDone?: (po: PurchaseOrder) => void }) {
  const vendors = useVendors();
  const quotations = useQuotations().filter((q) => q.indentId === indent.id);
  const settings = useProcurementSettings();
  const [adding, setAdding] = useState(false);
  const blank = () => ({ vendorId: "", rates: {} as Record<number, string>, gstPercent: "18", deliveryDays: "7", validTill: daysFromToday(15), notes: "" });
  const [draft, setDraft] = useState(blank);
  const [chosen, setChosen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const { error, run, busy } = useAction();
  const buy = indent.lines.map((l, n) => ({ l, n })).filter(({ l }) => (l.toPurchase ?? 0) > 0);
  const totals = quotations.map((q) => ({ q, ...quotationTotal(q, indent) }));
  const lowest = totals.length ? Math.min(...totals.map((t) => t.total)) : 0;
  const needMore = purchaseEstimate(indent) >= settings.quotationThreshold && quotations.length < settings.minQuotations;
  const vendor = (id: number) => vendors.find((v) => v.id === id);
  const chosenTotal = totals.find((t) => t.q.id === chosen)?.total;
  const needsReason = needMore || (chosenTotal !== undefined && chosenTotal !== lowest);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill className={needMore ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}>{quotations.length} of {settings.minQuotations} quotations</Pill>
        <span className="text-muted-foreground">{needMore ? `Purchases from ${inr(settings.quotationThreshold)} need ${settings.minQuotations} quotations (or a written reason).` : "Pick the lowest unless there is a good reason."}</span>
      </div>
      {totals.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {totals.map(({ q, total }) => {
            const v = vendor(q.vendorId);
            const best = total === lowest;
            return (
              <label key={q.id} className={cn("relative cursor-pointer rounded-xl border p-3 transition", chosen === q.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40", best && "bg-emerald-500/5")}>
                <input type="radio" className="sr-only" name={`q-${indent.id}`} checked={chosen === q.id} onChange={() => setChosen(q.id)} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-medium text-foreground">{v?.name ?? "—"}</p><p className="font-mono text-[11px] text-muted-foreground">{v?.code}</p></div>
                  {chosen === q.id ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span> : <span className="h-5 w-5 rounded-full border border-border" />}
                </div>
                <p className="mt-2 text-xl font-semibold text-foreground">{inr(total)}</p>
                <p className="text-xs text-muted-foreground">incl. {q.gstPercent}% GST · delivery {q.deliveryDays} days</p>
                <div className="mt-2 space-y-0.5 text-xs">
                  {buy.map(({ l, n }) => <div key={n} className="flex justify-between gap-2"><span className="truncate text-muted-foreground">{l.name} ×{l.toPurchase}</span><span className="tabular-nums">{inr(q.lines.find((x) => x.line === n)?.rate ?? 0)}</span></div>)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {best && <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">Lowest</Badge>}
                  {q.validTill < today() && <Badge variant="destructive">Expired</Badge>}
                  {q.notes && <span className="truncate text-[11px] text-muted-foreground">{q.notes}</span>}
                  <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Remove quotation" onClick={(ev) => { ev.preventDefault(); void run(() => removeQuotation(q.id)); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </label>
            );
          })}
        </div>
      )}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add quotation</Button>
        <Input placeholder={needsReason ? "Reason (required — fewer quotations / not the lowest)" : "Note for the PO (optional)"} value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="Reason" className={cn(needsReason && !note.trim() && "border-amber-500")} />
        <Button size="sm" className="gap-1.5" disabled={!chosen || busy} onClick={() => run(async () => { const po = await raisePurchaseOrder(indent.id, chosen!, STORE, note); toast.success(`${po.no} sent to ${vendor(po.vendorId)?.name}`); onDone?.(po); })}>
          <FileCheck2 className="h-4 w-4" />Create purchase order
        </Button>
      </div>
      <ErrorText error={error} />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Quotation for {indent.no}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Vendor</Label>
              <Select value={draft.vendorId} onValueChange={(v) => setDraft({ ...draft, vendorId: v })}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>{vendors.filter((v) => v.active && !quotations.some((q) => q.vendorId === v.id)).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.code ? `${v.code} · ` : ""}{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {buy.map(({ l, n }) => (
              <div key={n} className="space-y-2"><Label>{l.name} — ₹ per {l.unit}</Label><Input type="number" min={0} value={draft.rates[n] ?? ""} onChange={(ev) => setDraft({ ...draft, rates: { ...draft.rates, [n]: ev.target.value } })} /></div>
            ))}
            <div className="space-y-2"><Label>GST %</Label><Select value={draft.gstPercent} onValueChange={(v) => setDraft({ ...draft, gstPercent: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["0", "5", "12", "18", "28"].map((g) => <SelectItem key={g} value={g}>{g}%</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Delivery (days)</Label><Input type="number" min={0} value={draft.deliveryDays} onChange={(ev) => setDraft({ ...draft, deliveryDays: ev.target.value })} /></div>
            <div className="space-y-2"><Label>Valid till</Label><Input type="date" min={today()} value={draft.validTill} onChange={(ev) => setDraft({ ...draft, validTill: ev.target.value })} /></div>
            <div className="space-y-2"><Label>Notes</Label><Input value={draft.notes} onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })} placeholder="Brand, warranty…" /></div>
          </div>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={!draft.vendorId || busy} onClick={() => run(
              () => addQuotation({
                indentId: indent.id, vendorId: Number(draft.vendorId), gstPercent: Number(draft.gstPercent), deliveryDays: Number(draft.deliveryDays), validTill: draft.validTill, notes: draft.notes,
                lines: buy.map(({ n }) => ({ line: n, rate: Number(draft.rates[n]) })),
              }),
              () => { setAdding(false); setDraft(blank()); toast.success("Quotation added"); },
            )}>Save quotation</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Goods receipt ─────────────────────────────────────────────────────────────

export function ReceiveDialog({ po, onClose, onSaved }: { po: PurchaseOrder; onClose: () => void; onSaved?: (g: GoodsReceipt) => void }) {
  const indent = useIndents().find((i) => i.id === po.indentId);
  const vendor = useVendors().find((v) => v.id === po.vendorId);
  const [form, setForm] = useState({ checkedBy: indent?.requestedBy.name ?? "", challanNo: "" });
  const [lines, setLines] = useState(po.lines.map((l) => ({ line: l.line, received: l.qty - l.received, accepted: l.qty - l.received, rejectedReason: "" })));
  const { error, run, busy } = useAction();
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const value = round2(po.lines.reduce((s, l, i) => s + lines[i].accepted * l.rate, 0) * (1 + po.gstPercent / 100));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Goods receipt note — {po.no}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{vendor?.code} · {vendor?.name} · for {indent?.location}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label>Delivery challan no.</Label><Input value={form.challanNo} onChange={(ev) => setForm({ ...form, challanNo: ev.target.value })} placeholder="DC-1042" /></div>
          <div className="space-y-2"><Label>Quality checked by</Label><Input value={form.checkedBy} onChange={(ev) => setForm({ ...form, checkedBy: ev.target.value })} /></div>
        </div>
        <div className="space-y-2">
          {po.lines.map((l, i) => {
            const due = l.qty - l.received;
            return (
              <div key={i} className={cn("grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1.6fr_0.8fr_0.8fr_1.6fr]", !due && "opacity-50")}>
                <div className="col-span-2 sm:col-span-1"><p className="font-medium text-foreground">{l.name}</p><p className="text-xs text-muted-foreground">Due {due} of {l.qty} {l.unit} · {inr(l.rate)}</p></div>
                <div><Label className="text-xs">Received</Label><Input type="number" min={0} max={due} disabled={!due} value={lines[i].received} onChange={(ev) => { const r = Math.max(0, Math.min(due, Math.floor(Number(ev.target.value)))); set(i, { received: r, accepted: Math.min(lines[i].accepted, r) }); }} /></div>
                <div><Label className="text-xs">Accepted</Label><Input type="number" min={0} max={lines[i].received} disabled={!due} value={lines[i].accepted} onChange={(ev) => set(i, { accepted: Math.max(0, Math.min(lines[i].received, Math.floor(Number(ev.target.value)))) })} /></div>
                <div className="col-span-2 sm:col-span-1"><Label className="text-xs">Why rejected</Label><Input disabled={lines[i].accepted >= lines[i].received} value={lines[i].rejectedReason} onChange={(ev) => set(i, { rejectedReason: ev.target.value })} placeholder="Damaged, wrong size…" /></div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Accepted value (goes to Accounts for billing)</span><span className="text-lg font-semibold">{inr(value)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Accepted items go into stock now; the GRN is sent to Accounts, who match the vendor's bill to the PO and this receipt before paying.</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-2" disabled={busy} onClick={() => run(async () => { const g = await receiveGoods(po.id, STORE, { ...form, lines: lines.map((l) => ({ ...l, line: l.line })) }); toast.success(`${g.no} saved — stock updated, sent to Accounts`); onSaved?.(g); }, onClose)}>
            <PackageCheck className="h-4 w-4" />Save GRN
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Vendor form ───────────────────────────────────────────────────────────────

export type VendorDraft = Omit<Vendor, "id"> & { id?: number };
export const blankVendor = (): VendorDraft => ({ code: "", name: "", category: "", gstin: "", pan: "", phone: "", email: "", address: "", bankName: "", accountNo: "", ifsc: "", tdsSection: "194C", isIndividual: false, active: true });

export function VendorDialog({ draft, setDraft }: { draft: VendorDraft | null; setDraft: (d: VendorDraft | null) => void }) {
  const { error, run, busy } = useAction();
  const field = (k: keyof VendorDraft, label: string, placeholder = "", upper = false) => (
    <div className="space-y-1.5"><Label>{label}</Label><Input value={String(draft?.[k] ?? "")} placeholder={placeholder} onChange={(ev) => draft && setDraft({ ...draft, [k]: upper ? ev.target.value.toUpperCase() : ev.target.value })} /></div>
  );
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{draft?.id ? `Edit vendor ${draft.code}` : "New vendor"}</DialogTitle></DialogHeader>
        {draft && (
          <div className="space-y-4">
            {!draft.id && <p className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">The vendor code (V-0001, V-0002…) is given automatically when you save.</p>}
            <section className="grid gap-3 sm:grid-cols-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">Business</p>
              {field("name", "Vendor name", "Laxmi Scientific Co.")}{field("category", "Supplies", "Lab supplies, stationery…")}
              {field("gstin", "GSTIN", "09AAKFL1234M1Z5", true)}{field("pan", "PAN", "AAKFL1234M", true)}
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">Contact</p>
              {field("phone", "Phone")}{field("email", "Email")}
              <div className="sm:col-span-2">{field("address", "Address")}</div>
            </section>
            <section className="grid gap-3 sm:grid-cols-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-3">Bank (for payment by Accounts)</p>
              {field("bankName", "Bank")}{field("accountNo", "Account number")}{field("ifsc", "IFSC", "HDFC0000123", true)}
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">Tax</p>
              <div className="space-y-1.5">
                <Label>TDS section</Label>
                <Select value={draft.tdsSection} onValueChange={(v: TdsSection) => setDraft({ ...draft, tdsSection: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="194C">194C — contractor / supplier of work</SelectItem><SelectItem value="194J">194J — professional services</SelectItem><SelectItem value="194I">194I — rent</SelectItem><SelectItem value="None">None — goods only</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 text-sm"><Switch checked={draft.isIndividual} onCheckedChange={(v) => setDraft({ ...draft, isIndividual: v })} />Individual / HUF (194C at 1%)</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />Active</label>
              </div>
            </section>
          </div>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={busy} onClick={() => run(() => saveVendor(draft!), () => { toast.success(draft?.id ? "Vendor updated" : "Vendor created"); setDraft(null); })}>Save vendor</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ── Printable documents ───────────────────────────────────────────────────────

interface School { name: string; address: string; city: string; phone: string }
const head = (s: School, title: string, no: string, meta: string) =>
  `<div class="head" style="display:flex;justify-content:space-between;gap:16px"><div><h1>${e(s.name)}</h1><div class="muted">${e(`${s.address}, ${s.city} · ${s.phone}`)}</div></div>
   <div class="right"><strong>${title}</strong><br/>${e(no)}<br/><span class="muted">${meta}</span></div></div>`;

export function poHtml(po: PurchaseOrder, vendor: Vendor | undefined, indent: Indent | undefined, s: School) {
  const sub = po.lines.reduce((t, l) => t + l.qty * l.rate, 0);
  const gst = (sub * po.gstPercent) / 100;
  return `${head(s, "PURCHASE ORDER", po.no, `Date ${po.date} · Deliver by ${po.deliveryBy}`)}
    <table><tbody><tr><td style="width:50%"><span class="muted">Vendor</span><br/><strong>${e(vendor?.name ?? "")}</strong> (${e(vendor?.code ?? "")})<br/>${e(vendor?.address ?? "")}<br/>GSTIN ${e(vendor?.gstin || "—")} · ${e(vendor?.phone ?? "")}</td>
    <td><span class="muted">Deliver to</span><br/><strong>Store, ${e(s.name)}</strong><br/>For ${e(indent?.location ?? "")}<br/>Against requisition ${e(indent?.no ?? "")}</td></tr></tbody></table>
    <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
    ${po.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${e(l.name)}</td><td class="num">${l.qty} ${e(l.unit)}</td><td class="num">${inrText(l.rate)}</td><td class="num">${inrText(l.qty * l.rate)}</td></tr>`).join("")}
    <tr><td colspan="4" class="right">Subtotal</td><td class="num">${inrText(sub)}</td></tr>
    <tr><td colspan="4" class="right">GST ${po.gstPercent}%</td><td class="num">${inrText(gst)}</td></tr>
    <tr class="total"><td colspan="4" class="right">Total</td><td class="num">${inrText(sub + gst)}</td></tr></tbody></table>
    <p class="muted">1. Quote this PO number on the delivery challan and the bill. 2. Goods are accepted after the quality check at the store; rejected items are returned at the vendor's cost.
    3. Payment by NEFT within 30 days of an accepted delivery and a matching bill; TDS is deducted where applicable.</p>
    <div class="sign"><div>Prepared by<br/><br/>Store In-charge</div><div>Authorised signatory<br/><br/>${e(s.name)}</div></div>`;
}

export function grnHtml(g: GoodsReceipt, po: PurchaseOrder | undefined, vendor: Vendor | undefined, s: School) {
  const lines = g.lines.map((l) => ({ ...l, pl: po?.lines.find((x) => x.line === l.line) }));
  const value = lines.reduce((t, l) => t + l.accepted * (l.pl?.rate ?? 0), 0);
  return `${head(s, "GOODS RECEIPT NOTE", g.no, `Received ${g.date}`)}
    <table><tbody><tr><td style="width:50%"><span class="muted">Vendor</span><br/><strong>${e(vendor?.name ?? "")}</strong> (${e(vendor?.code ?? "")})</td>
    <td><span class="muted">Against</span><br/>PO ${e(po?.no ?? "")} · challan ${e(g.challanNo)}<br/>Received by ${e(g.receivedBy)} · checked by ${e(g.checkedBy)}</td></tr></tbody></table>
    <table><thead><tr><th>Item</th><th class="num">Received</th><th class="num">Accepted</th><th class="num">Rejected</th><th>Reason</th><th class="num">Rate</th><th class="num">Accepted value</th></tr></thead><tbody>
    ${lines.map((l) => `<tr><td>${e(l.pl?.name ?? "")}</td><td class="num">${l.received}</td><td class="num">${l.accepted}</td><td class="num">${l.received - l.accepted}</td><td>${e(l.rejectedReason ?? "")}</td><td class="num">${inrText(l.pl?.rate ?? 0)}</td><td class="num">${inrText(l.accepted * (l.pl?.rate ?? 0))}</td></tr>`).join("")}
    <tr class="total"><td colspan="6" class="right">Accepted value (before GST ${po?.gstPercent ?? 0}%)</td><td class="num">${inrText(value)}</td></tr></tbody></table>
    <p class="muted">Accepted goods have been taken into stock. This GRN is forwarded to Accounts for matching with the vendor's bill (PO × GRN × bill) and payment.</p>
    <div class="sign"><div>Received by<br/><br/>${e(g.receivedBy)}</div><div>Quality checked by<br/><br/>${e(g.checkedBy)}</div><div>Store In-charge</div></div>`;
}

/** Billable value of an order that Accounts has not billed yet. */
export const unbilledValue = (po: PurchaseOrder) => Math.max(0, round2(receivedValue(po).total - po.bills.filter((b) => b.status !== "ON_HOLD").reduce((s, b) => s + b.total, 0)));
