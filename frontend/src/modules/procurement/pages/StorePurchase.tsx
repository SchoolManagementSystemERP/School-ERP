import { useMemo, useState } from "react";
import { FileText, PackageCheck, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { cn } from "@/components/ui/utils";
import { daysFromToday, today } from "@/lib/dates";
import { useInventorySettings, useItems } from "@/store/inventory";
import {
  addQuotation, cancelPurchaseOrder, inr, issueToRequester, purchaseEstimate, quotationTotal, raisePurchaseOrder, receiveGoods, removeQuotation, round2,
  saveVendor, storeCheck, useGoodsReceipts, useIndents, useProcurementSettings, usePurchaseOrders, useQuotations, useVendors,
  type Indent, type PurchaseOrder, type TdsSection, type Vendor,
} from "@/store/procurement";
import { useSite } from "@/store/website";
import { ErrorText, IndentCard, useAction } from "../components";

const STORE: { role: string; name: string } = { role: "inventory", name: "Store In-charge" };

// ── Store check ───────────────────────────────────────────────────────────────

function StoreCheck({ indent }: { indent: Indent }) {
  const items = useItems();
  const settings = useInventorySettings();
  const [rows, setRows] = useState(() =>
    indent.lines.map((l) => {
      const item = items.find((it) => it.id === l.itemId);
      return { itemId: l.itemId, category: l.category ?? "Lab Equipment", issue: item ? Math.min(item.quantity, l.qty) : 0, estRate: l.estRate || item?.unitPrice || 0 };
    }),
  );
  const [remark, setRemark] = useState("");
  const { error, run } = useAction();
  const set = (n: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const toBuy = indent.lines.reduce((s, l, n) => s + (l.qty - rows[n].issue) * rows[n].estRate, 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 font-medium">Item asked</th><th className="px-3 py-2 font-medium">Store item</th><th className="px-3 py-2 text-right font-medium">In stock</th><th className="px-3 py-2 font-medium">Issue now</th><th className="px-3 py-2 font-medium">To buy</th><th className="px-3 py-2 font-medium">Rate ₹</th></tr>
          </thead>
          <tbody>
            {indent.lines.map((l, n) => {
              const item = items.find((it) => it.id === rows[n].itemId);
              return (
                <tr key={n} className="border-t border-border align-top">
                  <td className="px-3 py-2"><p className="font-medium text-foreground">{l.name}</p><p className="text-xs text-muted-foreground">{l.qty} {l.unit}</p></td>
                  <td className="px-3 py-2">
                    <Select value={rows[n].itemId ? String(rows[n].itemId) : "new"} onValueChange={(v) => { const it = items.find((x) => String(x.id) === v); set(n, { itemId: it?.id, issue: it ? Math.min(it.quantity, l.qty) : 0, estRate: rows[n].estRate || it?.unitPrice || 0 }); }}>
                      <SelectTrigger className="h-8 w-56" aria-label="Store item"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Not stocked — new item</SelectItem>
                        {items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!item && (
                      <Select value={rows[n].category} onValueChange={(v) => set(n, { category: v })}>
                        <SelectTrigger className="mt-1 h-8 w-56" aria-label="Category for the new item"><SelectValue /></SelectTrigger>
                        <SelectContent>{settings.categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item ? `${item.quantity} ${item.unit}` : "—"}</td>
                  <td className="px-3 py-2"><Input className="h-8 w-20" type="number" min={0} max={item ? Math.min(item.quantity, l.qty) : 0} disabled={!item} value={rows[n].issue} onChange={(e) => set(n, { issue: Math.max(0, Math.floor(Number(e.target.value))) })} aria-label="Issue from stock" /></td>
                  <td className="px-3 py-2 tabular-nums">{Math.max(0, l.qty - rows[n].issue)}</td>
                  <td className="px-3 py-2"><Input className="h-8 w-24" type="number" min={0} value={rows[n].estRate} onChange={(e) => set(n, { estRate: Number(e.target.value) })} aria-label="Estimated rate" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input placeholder="Remark for the principal (optional)" value={remark} onChange={(e) => setRemark(e.target.value)} aria-label="Remark" />
        <Button onClick={() => run(() => storeCheck(indent.id, STORE, rows, remark), () => toast.success(toBuy > 0 ? `${indent.no}: stock issued, rest sent for approval (${inr(toBuy)})` : `${indent.no}: everything issued from stock`))}>
          {toBuy > 0 ? `Issue & send ${inr(round2(toBuy))} for approval` : "Issue from stock & close"}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

// ── Quotations & PO ───────────────────────────────────────────────────────────

function Quotations({ indent }: { indent: Indent }) {
  const vendors = useVendors();
  const quotations = useQuotations().filter((q) => q.indentId === indent.id);
  const settings = useProcurementSettings();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ vendorId: "", rates: {} as Record<number, string>, gstPercent: "12", deliveryDays: "7", validTill: daysFromToday(15), notes: "" });
  const [chosen, setChosen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const { error, run } = useAction();
  const buy = indent.lines.map((l, n) => ({ l, n })).filter(({ l }) => (l.toPurchase ?? 0) > 0);
  const totals = quotations.map((q) => ({ q, ...quotationTotal(q, indent) }));
  const lowest = totals.length ? Math.min(...totals.map((t) => t.total)) : 0;
  const needMore = purchaseEstimate(indent) >= settings.quotationThreshold && quotations.length < settings.minQuotations;
  const vendorName = (id: number) => vendors.find((v) => v.id === id)?.name ?? "—";

  const save = () =>
    run(
      () => addQuotation({
        indentId: indent.id, vendorId: Number(draft.vendorId), gstPercent: Number(draft.gstPercent), deliveryDays: Number(draft.deliveryDays), validTill: draft.validTill, notes: draft.notes,
        lines: buy.map(({ n }) => ({ line: n, rate: Number(draft.rates[n]) })),
      }),
      () => { setAdding(false); setDraft({ vendorId: "", rates: {}, gstPercent: "12", deliveryDays: "7", validTill: daysFromToday(15), notes: "" }); toast.success("Quotation added"); },
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {needMore ? <>Needs <b>{settings.minQuotations}</b> quotations (estimate is from {inr(settings.quotationThreshold)}). {quotations.length} received.</> : `${quotations.length} quotation(s) received.`} Pick the lowest unless there is a good reason.
      </p>
      {totals.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2" /><th className="px-3 py-2 font-medium">Vendor</th>{buy.map(({ l, n }) => <th key={n} className="px-3 py-2 text-right font-medium">{l.name} ×{l.toPurchase}</th>)}<th className="px-3 py-2 text-right font-medium">GST</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="px-3 py-2 font-medium">Delivery</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {totals.map(({ q, total }) => (
                <tr key={q.id} className={cn("border-t border-border", total === lowest && "bg-emerald-500/5")}>
                  <td className="px-3 py-2"><input type="radio" name={`q-${indent.id}`} checked={chosen === q.id} onChange={() => setChosen(q.id)} aria-label={`Choose ${vendorName(q.vendorId)}`} /></td>
                  <td className="px-3 py-2 font-medium text-foreground">{vendorName(q.vendorId)} {total === lowest && <Badge variant="outline" className="ml-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">Lowest</Badge>}{q.validTill < today() && <Badge variant="destructive" className="ml-1">Expired</Badge>}</td>
                  {buy.map(({ n }) => <td key={n} className="px-3 py-2 text-right tabular-nums">{inr(q.lines.find((x) => x.line === n)?.rate ?? 0)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums">{q.gstPercent}%</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(total)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{q.deliveryDays} days</td>
                  <td className="px-3 py-2"><Button variant="ghost" size="icon" aria-label="Remove quotation" onClick={() => run(() => removeQuotation(q.id))}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add quotation</Button>
        <Input placeholder={needMore || (chosen && totals.find((t) => t.q.id === chosen)?.total !== lowest) ? "Reason (required: fewer quotations / not the lowest)" : "Note for the PO (optional)"} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason" />
        <Button size="sm" className="gap-1.5" disabled={!chosen} onClick={() => run(async () => { const po = await raisePurchaseOrder(indent.id, chosen!, STORE, note); toast.success(`${po.no} sent to ${vendorName(po.vendorId)}`); })}><FileText className="h-4 w-4" />Raise purchase order</Button>
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
                <SelectContent>{vendors.filter((v) => v.active).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name} · {v.category}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {buy.map(({ l, n }) => (
              <div key={n} className="space-y-2"><Label>{l.name} — ₹ per {l.unit}</Label><Input type="number" min={0} value={draft.rates[n] ?? ""} onChange={(e) => setDraft({ ...draft, rates: { ...draft.rates, [n]: e.target.value } })} /></div>
            ))}
            <div className="space-y-2"><Label>GST %</Label><Input type="number" min={0} max={28} value={draft.gstPercent} onChange={(e) => setDraft({ ...draft, gstPercent: e.target.value })} /></div>
            <div className="space-y-2"><Label>Delivery (days)</Label><Input type="number" min={0} value={draft.deliveryDays} onChange={(e) => setDraft({ ...draft, deliveryDays: e.target.value })} /></div>
            <div className="space-y-2"><Label>Valid till</Label><Input type="date" value={draft.validTill} onChange={(e) => setDraft({ ...draft, validTill: e.target.value })} /></div>
            <div className="space-y-2"><Label>Notes</Label><Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Brand, warranty…" /></div>
          </div>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save}>Save quotation</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Purchase order document & goods receipt ───────────────────────────────────

function PODocument({ po }: { po: PurchaseOrder }) {
  const vendor = useVendors().find((v) => v.id === po.vendorId);
  const indent = useIndents().find((i) => i.id === po.indentId);
  const site = useSite();
  const sub = po.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const gst = (sub * po.gstPercent) / 100;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-col justify-between gap-2 border-b border-border pb-3 sm:flex-row">
        <div><p className="font-display text-lg font-semibold">{site.name}</p><p className="text-muted-foreground">{site.address}, {site.city} · {site.phone}</p></div>
        <div className="sm:text-right"><p className="font-semibold">PURCHASE ORDER</p><p className="font-mono">{po.no}</p><p className="text-muted-foreground">Date {po.date} · Deliver by {po.deliveryBy}</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs uppercase text-muted-foreground">To</p><p className="font-medium">{vendor?.name}</p><p className="text-muted-foreground">{vendor?.address}</p><p className="text-muted-foreground">GSTIN {vendor?.gstin || "—"} · {vendor?.phone}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Deliver to</p><p className="font-medium">Store, {site.name}</p><p className="text-muted-foreground">For {indent?.location} · ref. {indent?.no}</p></div>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="py-2">#</th><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {po.lines.map((l, i) => <tr key={i} className="border-b border-border"><td className="py-2">{i + 1}</td><td className="py-2">{l.name}</td><td className="py-2 text-right tabular-nums">{l.qty} {l.unit}</td><td className="py-2 text-right tabular-nums">{inr(l.rate)}</td><td className="py-2 text-right tabular-nums">{inr(l.qty * l.rate)}</td></tr>)}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="py-1 text-right text-muted-foreground">Subtotal</td><td className="py-1 text-right tabular-nums">{inr(round2(sub))}</td></tr>
          <tr><td colSpan={4} className="py-1 text-right text-muted-foreground">GST {po.gstPercent}%</td><td className="py-1 text-right tabular-nums">{inr(round2(gst))}</td></tr>
          <tr><td colSpan={4} className="py-1 text-right font-semibold">Total</td><td className="py-1 text-right font-semibold tabular-nums">{inr(round2(sub + gst))}</td></tr>
        </tfoot>
      </table>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Quote this PO number on the delivery challan and the bill.</li>
        <li>Goods are accepted after the quality check at the school store; rejected items are returned at the vendor's cost.</li>
        <li>Payment by NEFT within 30 days of an accepted delivery and a correct bill. TDS is deducted where applicable.</li>
      </ul>
    </div>
  );
}

function ReceiveDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const indent = useIndents().find((i) => i.id === po.indentId);
  const [form, setForm] = useState({ checkedBy: indent?.requestedBy.name ?? "", challanNo: "" });
  const [lines, setLines] = useState(po.lines.map((l) => ({ line: l.line, received: l.qty - l.received, accepted: l.qty - l.received, rejectedReason: "" })));
  const { error, run } = useAction();
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Receive goods — {po.no}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label>Delivery challan no.</Label><Input value={form.challanNo} onChange={(e) => setForm({ ...form, challanNo: e.target.value })} /></div>
          <div className="space-y-2"><Label>Quality checked by</Label><Input value={form.checkedBy} onChange={(e) => setForm({ ...form, checkedBy: e.target.value })} /></div>
        </div>
        <div className="space-y-2">
          {po.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1.6fr_0.8fr_0.8fr_1.6fr]">
              <div className="col-span-2 sm:col-span-1"><p className="font-medium text-foreground">{l.name}</p><p className="text-xs text-muted-foreground">Due {l.qty - l.received} of {l.qty} {l.unit}</p></div>
              <div><Label className="text-xs">Received</Label><Input type="number" min={0} value={lines[i].received} onChange={(e) => set(i, { received: Math.max(0, Math.floor(Number(e.target.value))), accepted: Math.min(lines[i].accepted, Math.max(0, Math.floor(Number(e.target.value)))) })} /></div>
              <div><Label className="text-xs">Accepted</Label><Input type="number" min={0} value={lines[i].accepted} onChange={(e) => set(i, { accepted: Math.max(0, Math.floor(Number(e.target.value))) })} /></div>
              <div className="col-span-2 sm:col-span-1"><Label className="text-xs">Why rejected</Label><Input disabled={lines[i].accepted >= lines[i].received} value={lines[i].rejectedReason} onChange={(e) => set(i, { rejectedReason: e.target.value })} placeholder="Damaged, wrong size…" /></div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Accepted items go into stock now. Hand them to {indent?.requestedBy.name} with "Issue to requester" once everything has arrived.</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-2" onClick={() => run(async () => { const g = await receiveGoods(po.id, STORE, { ...form, lines }); toast.success(`${g.no} recorded — stock updated`); }, onClose)}><PackageCheck className="h-4 w-4" />Save goods receipt</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────

const blankVendor = (): Omit<Vendor, "id"> & { id?: number } => ({ name: "", category: "", gstin: "", pan: "", phone: "", email: "", address: "", bankName: "", accountNo: "", ifsc: "", tdsSection: "194C", isIndividual: false, active: true });

function Vendors() {
  const vendors = useVendors();
  const [draft, setDraft] = useState<ReturnType<typeof blankVendor> | null>(null);
  const { error, run } = useAction();
  const field = (k: keyof ReturnType<typeof blankVendor>, label: string, placeholder = "") => (
    <div className="space-y-2"><Label>{label}</Label><Input value={String(draft?.[k] ?? "")} placeholder={placeholder} onChange={(e) => setDraft((d) => d && { ...d, [k]: e.target.value })} /></div>
  );
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button className="gap-2" onClick={() => setDraft(blankVendor())}><Plus className="h-4 w-4" />Add vendor</Button></div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">GSTIN / PAN</th><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Bank</th><th className="px-4 py-3 font-medium">TDS</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className={cn("border-b border-border last:border-0", !v.active && "opacity-50")}>
                  <td className="px-4 py-3"><p className="font-medium text-foreground">{v.name}</p><p className="text-xs text-muted-foreground">{v.category}</p></td>
                  <td className="px-4 py-3 font-mono text-xs">{v.gstin || "—"}<br />{v.pan || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.phone}<br />{v.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.bankName}<br /><span className="font-mono text-xs">{v.ifsc} · ****{v.accountNo.slice(-4)}</span></td>
                  <td className="px-4 py-3">{v.tdsSection}</td>
                  <td className="px-4 py-3"><Button variant="ghost" size="icon" aria-label={`Edit ${v.name}`} onClick={() => setDraft({ ...v })}><Pencil className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field("name", "Name")}{field("category", "Supplies", "Lab supplies, stationery…")}
              {field("gstin", "GSTIN", "09AAKFL1234M1Z5")}{field("pan", "PAN", "AAKFL1234M")}
              {field("phone", "Phone")}{field("email", "Email")}
              <div className="sm:col-span-2">{field("address", "Address")}</div>
              {field("bankName", "Bank")}{field("accountNo", "Account number")}{field("ifsc", "IFSC", "HDFC0000123")}
              <div className="space-y-2">
                <Label>TDS section</Label>
                <Select value={draft.tdsSection} onValueChange={(v: TdsSection) => setDraft({ ...draft, tdsSection: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="194C">194C — contractor / supplier of work</SelectItem><SelectItem value="194J">194J — professional services</SelectItem><SelectItem value="194I">194I — rent</SelectItem><SelectItem value="None">None — goods only</SelectItem></SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.isIndividual} onCheckedChange={(v) => setDraft({ ...draft, isIndividual: v })} />Individual / HUF (194C at 1%)</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />Active</label>
            </div>
          )}
          <ErrorText error={error} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={() => run(() => saveVendor(draft!), () => { setDraft(null); toast.success("Vendor saved"); })}>Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PO_TONE: Record<PurchaseOrder["status"], string> = {
  SENT: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  PARTIALLY_RECEIVED: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  RECEIVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function StorePurchase() {
  const indents = useIndents();
  const orders = usePurchaseOrders();
  const receipts = useGoodsReceipts();
  const vendors = useVendors();
  const [viewPo, setViewPo] = useState<PurchaseOrder | null>(null);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const issue = useAction();
  const cancel = useAction();

  const storeQueue = indents.filter((i) => i.status === "PENDING_STORE");
  const toQuote = indents.filter((i) => i.status === "APPROVED_FOR_PURCHASE");
  const toIssue = indents.filter((i) => i.status === "GOODS_RECEIVED");
  const openPos = orders.filter((p) => p.status === "SENT" || p.status === "PARTIALLY_RECEIVED");
  const vendorName = (id: number) => vendors.find((v) => v.id === id)?.name ?? "—";
  const poTotal = (p: PurchaseOrder) => round2(p.lines.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + p.gstPercent / 100));
  const awaiting = useMemo(() => indents.filter((i) => i.status === "PENDING_PRINCIPAL" || i.status === "PENDING_MANAGEMENT").length, [indents]);

  return (
    <div className="space-y-6">
      <PageHeader title="Store & Purchase" description="Requisitions from teachers: give from stock, buy the rest, receive and hand over" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Store check" value={storeQueue.length} icon={PackageCheck} tone="blue" hint="Requisitions to look at" />
        <StatCard label="Awaiting approval" value={awaiting} icon={FileText} tone="amber" hint="With Principal / Management" />
        <StatCard label="Get quotations" value={toQuote.length} icon={FileText} tone="purple" />
        <StatCard label="Orders pending delivery" value={openPos.length} icon={Truck} tone="indigo" hint={`${openPos.filter((p) => p.deliveryBy < today()).length} overdue`} />
      </div>

      <Tabs defaultValue="store">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="store">Store check ({storeQueue.length})</TabsTrigger>
          <TabsTrigger value="quotes">Quotations ({toQuote.length})</TabsTrigger>
          <TabsTrigger value="orders">Purchase orders ({openPos.length})</TabsTrigger>
          <TabsTrigger value="issue">Hand over ({toIssue.length})</TabsTrigger>
          <TabsTrigger value="vendors">Vendors ({vendors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="store" className="mt-4 space-y-3">
          {storeQueue.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No requisitions waiting for the store.</CardContent></Card>}
          {storeQueue.map((i) => <IndentCard key={i.id} indent={i} actions={<StoreCheck indent={i} />} />)}
        </TabsContent>

        <TabsContent value="quotes" className="mt-4 space-y-3">
          {toQuote.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No approved purchases waiting for quotations.</CardContent></Card>}
          {toQuote.map((i) => <IndentCard key={i.id} indent={i} actions={<Quotations indent={i} />} />)}
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <ErrorText error={cancel.error} />
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">PO</th><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">For</th><th className="px-4 py-3 font-medium">Deliver by</th><th className="px-4 py-3 text-right font-medium">Value</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
                <tbody>
                  {orders.map((p) => {
                    const i = indents.find((x) => x.id === p.indentId);
                    const late = (p.status === "SENT" || p.status === "PARTIALLY_RECEIVED") && p.deliveryBy < today();
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{p.no}<br /><span className="text-muted-foreground">{p.date}</span></td>
                        <td className="px-4 py-3 text-foreground">{vendorName(p.vendorId)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{i?.location}<br /><span className="font-mono text-xs">{i?.no}</span></td>
                        <td className={cn("px-4 py-3", late && "font-medium text-red-600 dark:text-red-400")}>{p.deliveryBy}{late && " · overdue"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{inr(poTotal(p))}</td>
                        <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PO_TONE[p.status])}>{p.status.replace("_", " ").toLowerCase()}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setViewPo(p)}>View</Button>
                            {(p.status === "SENT" || p.status === "PARTIALLY_RECEIVED") && <Button size="sm" onClick={() => setReceivePo(p)}>Receive</Button>}
                            {p.status === "SENT" && <Button size="sm" variant="outline" onClick={() => cancel.run(() => cancelPurchaseOrder(p.id, STORE, "Cancelled by store — vendor could not supply"), () => toast.success(`${p.no} cancelled; requisition back to quotations`))}>Cancel</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {receipts.length > 0 && (
            <p className="text-xs text-muted-foreground">Goods receipts: {receipts.map((g) => `${g.no} (${orders.find((p) => p.id === g.poId)?.no}, challan ${g.challanNo}, checked by ${g.checkedBy})`).join(" · ")}</p>
          )}
        </TabsContent>

        <TabsContent value="issue" className="mt-4 space-y-3">
          <ErrorText error={issue.error} />
          {toIssue.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing received and waiting to be handed over.</CardContent></Card>}
          {toIssue.map((i) => (
            <IndentCard key={i.id} indent={i} actions={<Button onClick={() => issue.run(() => issueToRequester(i.id, STORE), () => toast.success(`${i.no} handed over to ${i.requestedBy.name}`))}>Issue to {i.requestedBy.name}</Button>} />
          ))}
        </TabsContent>

        <TabsContent value="vendors" className="mt-4"><Vendors /></TabsContent>
      </Tabs>

      <Dialog open={!!viewPo} onOpenChange={(o) => !o && setViewPo(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase order</DialogTitle></DialogHeader>
          {viewPo && <PODocument po={viewPo} />}
          <div className="flex justify-end"><Button variant="outline" onClick={() => window.print()}>Print</Button></div>
        </DialogContent>
      </Dialog>
      {receivePo && <ReceiveDialog po={receivePo} onClose={() => setReceivePo(null)} />}
    </div>
  );
}
