/**
 * Procurement: from a teacher's indent to the vendor's payment.
 *
 *   Teacher raises an INDENT
 *     → HOD of the department approves          (skipped when the department has no HOD or the HOD raised it)
 *     → STORE checks stock: issue what is there, send the rest to purchase
 *     → PRINCIPAL approves the purchase           (up to the principal's limit)
 *     → MANAGEMENT approves                       (only above that limit)
 *     → PURCHASE collects QUOTATIONS, compares, picks a vendor, raises a PURCHASE ORDER
 *     → STORE receives the goods (GRN), quality check, stock in, issues them to the teacher
 *     → ACCOUNTANT records the vendor BILL, matches PO + GRN + bill, pays (TDS deducted)
 *
 * Every step is done by the API (/procurement, /payables, /petty-cash), which checks that the indent is in
 * the right state and that the person may take the step, so the order cannot be skipped. The actions
 * here are async: they reject with the reason when the server refuses, and reload the lists when done.
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { today } from "@/lib/dates";
import { canAny, isSelfService } from "./auth";
import { expenseStore } from "./finance";
import { itemStore, movementStore } from "./inventory";
import { ifAllowed, remoteStore } from "./remote";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndentStatus =
  | "PENDING_HOD"
  | "PENDING_STORE"
  | "PENDING_PRINCIPAL"
  | "PENDING_MANAGEMENT"
  | "APPROVED_FOR_PURCHASE"
  | "PO_RAISED"
  | "GOODS_RECEIVED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export const INDENT_STATUS_LABEL: Record<IndentStatus, string> = {
  PENDING_HOD: "Waiting for HOD",
  PENDING_STORE: "Store check",
  PENDING_PRINCIPAL: "Waiting for Principal",
  PENDING_MANAGEMENT: "Waiting for Management",
  APPROVED_FOR_PURCHASE: "Getting quotations",
  PO_RAISED: "Ordered from vendor",
  GOODS_RECEIVED: "Received in store",
  COMPLETED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** The steps shown on every indent's progress bar, in order. */
export const INDENT_STEPS: { key: string; label: string; statuses: IndentStatus[] }[] = [
  { key: "raised", label: "Raised", statuses: [] },
  { key: "hod", label: "HOD", statuses: ["PENDING_HOD"] },
  { key: "store", label: "Store", statuses: ["PENDING_STORE"] },
  { key: "approval", label: "Approval", statuses: ["PENDING_PRINCIPAL", "PENDING_MANAGEMENT"] },
  { key: "purchase", label: "Purchase", statuses: ["APPROVED_FOR_PURCHASE", "PO_RAISED"] },
  { key: "receipt", label: "Received", statuses: ["GOODS_RECEIVED"] },
  { key: "done", label: "Delivered", statuses: ["COMPLETED"] },
];

export type Priority = "Normal" | "Urgent";

export interface IndentLine {
  name: string;
  qty: number;
  unit: string;
  /** Teacher's estimate, ₹ per unit (store may correct it). */
  estRate: number;
  /** Matching inventory item, if the store keeps it. */
  itemId?: number;
  /** Category for a new inventory item created when the goods arrive. */
  category?: string;
  /** Filled at store check. */
  issuedFromStock?: number;
  toPurchase?: number;
}

export interface Actor {
  role: string;
  name: string;
}

export interface IndentEvent {
  at: string;
  by: string;
  role: string;
  action: string;
  remark?: string;
}

export interface Indent {
  id: number;
  no: string;
  requestedBy: Actor & { teacherId?: number };
  department: string;
  /** Where it is needed, e.g. "Chemistry Lab". */
  location: string;
  purpose: string;
  priority: Priority;
  /** YYYY-MM-DD */
  neededBy: string;
  raisedOn: string;
  lines: IndentLine[];
  status: IndentStatus;
  history: IndentEvent[];
  poId?: number;
}

export interface QuotationLine {
  /** Index into the indent's lines. */
  line: number;
  rate: number;
}

export interface Quotation {
  id: number;
  indentId: number;
  vendorId: number;
  lines: QuotationLine[];
  gstPercent: number;
  deliveryDays: number;
  /** YYYY-MM-DD */
  validTill: string;
  receivedOn: string;
  notes: string;
}

export type POStatus = "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface POLine {
  line: number;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  received: number;
  accepted: number;
}

export interface PurchaseOrder {
  id: number;
  no: string;
  indentId: number;
  vendorId: number;
  quotationId: number;
  date: string;
  deliveryBy: string;
  lines: POLine[];
  gstPercent: number;
  status: POStatus;
  /** Why this vendor when it was not the lowest quotation. */
  selectionNote?: string;
}

export interface GRNLine {
  line: number;
  received: number;
  accepted: number;
  rejectedReason?: string;
}

export interface GoodsReceipt {
  id: number;
  no: string;
  poId: number;
  date: string;
  receivedBy: string;
  checkedBy: string;
  challanNo: string;
  lines: GRNLine[];
}

export type BillStatus = "MATCHED" | "MISMATCH" | "APPROVED" | "PAID" | "ON_HOLD";

export interface VendorBill {
  id: number;
  poId: number;
  vendorId: number;
  billNo: string;
  billDate: string;
  subtotal: number;
  gst: number;
  total: number;
  /** PO rate × accepted quantity (+ GST) at the time the bill was entered. */
  expected: number;
  status: BillStatus;
  enteredOn: string;
  note?: string;
  paymentId?: number;
}

export type TdsSection = "None" | "194C" | "194J" | "194I";

export interface Vendor {
  id: number;
  name: string;
  category: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  tdsSection: TdsSection;
  /** Individual / HUF contractors pay 1% under 194C; others 2%. */
  isIndividual: boolean;
  active: boolean;
}

export interface VendorPayment {
  id: number;
  billId: number;
  vendorId: number;
  date: string;
  gross: number;
  tdsSection: TdsSection;
  tds: number;
  net: number;
  mode: "NEFT" | "Cheque" | "UPI";
  reference: string;
}

export interface PettyCashVoucher {
  id: number;
  date: string;
  kind: "spend" | "topup";
  purpose: string;
  paidTo: string;
  category: string;
  amount: number;
  approvedBy: string;
}

export interface ProcurementSettings {
  /** The principal approves purchases up to this amount; above it Management must approve too. */
  principalLimit: number;
  /** From this amount at least `minQuotations` quotations are needed (or a written reason). */
  quotationThreshold: number;
  minQuotations: number;
  /** Petty cash float and the most one voucher may spend. */
  pettyCashFloat: number;
  pettyCashVoucherLimit: number;
}

// ── From the API ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ProcurementSettings = {
  principalLimit: 50000,
  quotationThreshold: 5000,
  minQuotations: 3,
  pettyCashFloat: 10000,
  pettyCashVoucherLimit: 2000,
};

interface ApiIndent {
  id: string; no: string; status: IndentStatus; requesterName: string; requesterStaffId?: string | null; poId?: string | null;
  department: string; location: string; purpose: string; priority: "NORMAL" | "URGENT"; neededBy: string; raisedOn: string;
  lines: { lineNo: number; name: string; qty: number; unit: string; estRate: number; inventoryItemId: string | null; category: string | null; issuedFromStock: number | null; toPurchase: number | null }[];
  events: { at: string; by: string; role: string; action: string; remark: string | null }[];
}
interface ApiQuotation { id: string; indentId: string; vendorId: string; gstPercent: number; deliveryDays: number; validTill: string; receivedOn: string; notes: string | null; lines: { lineNo: number; rate: number }[] }
interface ApiPO {
  id: string; no: string; indentId: string; vendorId: string; quotationId: string; orderDate: string; deliveryBy: string; gstPercent: number; status: POStatus; selectionNote: string | null;
  lines: { lineNo: number; name: string; qty: number; unit: string; rate: number; received: number; accepted: number }[];
}
interface ApiGRN { id: string; no: string; poId: string; receivedOn: string; receivedBy: string; checkedBy: string; challanNo: string; lines: { lineNo: number; received: number; accepted: number; rejectedReason: string | null }[] }
interface ApiBill { id: string; poId: string; vendorId: string; billNo: string; billDate: string; subtotal: number; gst: number; total: number; expected: number; status: BillStatus; note: string | null; createdAt: string }
interface ApiVendor {
  id: string; name: string; category: string | null; gstin: string | null; pan: string | null; phone: string | null; email: string | null; address: string | null;
  bank: { bankName: string; ifsc: string; accountLast4: string } | null; tdsSection: "NONE" | "194C" | "194J" | "194I"; isIndividual: boolean; isActive: boolean;
}
interface ApiPayment { id: string; billId: string; vendorId: string; paidOn: string; gross: number; tdsSection: string; tds: number; net: number; mode: "NEFT" | "CHEQUE" | "UPI"; reference: string }
interface ApiPetty { balance: number; settings: ProcurementSettings; vouchers: { id: string; voucherDate: string; kind: "SPEND" | "TOPUP"; purpose: string; paidTo: string; category: string; amount: number; approvedBy: string }[] }

const ROLE_LABEL: Record<string, string> = { TEACHER: "Teacher", HOD: "HOD", STORE: "Store", PRINCIPAL: "Principal", MANAGEMENT: "Management", PURCHASE: "Purchase", SYSTEM: "System" };
const MASKED_ACCOUNT = /^X+\d{4}$/;

const toIndent = (i: ApiIndent): Indent => ({
  id: numId("indent", i.id), no: i.no, status: i.status, department: i.department, location: i.location, purpose: i.purpose,
  priority: i.priority === "URGENT" ? "Urgent" : "Normal", neededBy: i.neededBy, raisedOn: i.raisedOn,
  requestedBy: { role: "teacher", name: i.requesterName, ...(i.requesterStaffId ? { teacherId: numId("staff", i.requesterStaffId) } : {}) },
  lines: [...i.lines].sort((a, b) => a.lineNo - b.lineNo).map((l) => ({
    name: l.name, qty: l.qty, unit: l.unit, estRate: l.estRate,
    ...(l.inventoryItemId ? { itemId: numId("item", l.inventoryItemId) } : {}), ...(l.category ? { category: l.category } : {}),
    ...(l.issuedFromStock != null ? { issuedFromStock: l.issuedFromStock } : {}), ...(l.toPurchase != null ? { toPurchase: l.toPurchase } : {}),
  })),
  history: i.events.map((e) => ({ at: e.at.slice(0, 10), by: e.by, role: ROLE_LABEL[e.role] ?? e.role, action: e.action, ...(e.remark ? { remark: e.remark } : {}) })),
  ...(i.poId ? { poId: numId("po", i.poId) } : {}),
});
const toQuotation = (q: ApiQuotation): Quotation => ({
  id: numId("quotation", q.id), indentId: numId("indent", q.indentId), vendorId: numId("vendor", q.vendorId), gstPercent: q.gstPercent, deliveryDays: q.deliveryDays,
  validTill: q.validTill, receivedOn: q.receivedOn, notes: q.notes ?? "", lines: q.lines.map((l) => ({ line: l.lineNo, rate: l.rate })),
});
const toPO = (p: ApiPO): PurchaseOrder => ({
  id: numId("po", p.id), no: p.no, indentId: numId("indent", p.indentId), vendorId: numId("vendor", p.vendorId), quotationId: numId("quotation", p.quotationId),
  date: p.orderDate, deliveryBy: p.deliveryBy, gstPercent: p.gstPercent, status: p.status, ...(p.selectionNote ? { selectionNote: p.selectionNote } : {}),
  lines: p.lines.map((l) => ({ line: l.lineNo, name: l.name, qty: l.qty, unit: l.unit, rate: l.rate, received: l.received, accepted: l.accepted })),
});
const toGRN = (g: ApiGRN): GoodsReceipt => ({
  id: numId("grn", g.id), no: g.no, poId: numId("po", g.poId), date: g.receivedOn, receivedBy: g.receivedBy, checkedBy: g.checkedBy, challanNo: g.challanNo,
  lines: g.lines.map((l) => ({ line: l.lineNo, received: l.received, accepted: l.accepted, ...(l.rejectedReason ? { rejectedReason: l.rejectedReason } : {}) })),
});
const toVendor = (v: ApiVendor): Vendor => ({
  id: numId("vendor", v.id), name: v.name, category: v.category ?? "", gstin: v.gstin ?? "", pan: v.pan ?? "", phone: v.phone ?? "", email: v.email ?? "", address: v.address ?? "",
  bankName: v.bank?.bankName ?? "", accountNo: v.bank ? `XXXXXX${v.bank.accountLast4}` : "", ifsc: v.bank?.ifsc ?? "",
  tdsSection: v.tdsSection === "NONE" ? "None" : v.tdsSection, isIndividual: v.isIndividual, active: v.isActive,
});
const toPayment = (p: ApiPayment): VendorPayment => ({
  id: numId("vendor-payment", p.id), billId: numId("bill", p.billId), vendorId: numId("vendor", p.vendorId), date: p.paidOn, gross: p.gross,
  tdsSection: (p.tdsSection === "NONE" ? "None" : p.tdsSection) as TdsSection, tds: p.tds, net: p.net, mode: p.mode === "CHEQUE" ? "Cheque" : p.mode, reference: p.reference,
});

const seesPurchasing = () => canAny("procurement.store", "procurement.approve", "procurement.approve_management", "payables.manage");
const handlesGoods = () => canAny("procurement.store", "payables.manage");
const handlesPayables = () => canAny("payables.manage");

export const procurementSettingsStore = remoteStore<ProcurementSettings>("procurement-settings", DEFAULT_SETTINGS, async () =>
  isSelfService() ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...(await api.get<ProcurementSettings>("/procurement/settings")) });
export const vendorStore = remoteStore<Vendor[]>("vendors", [], async () => (seesPurchasing() ? (await ifAllowed(api.get<ApiVendor[]>("/procurement/vendors"), [])).map(toVendor) : []));
export const indentStore = remoteStore<Indent[]>("indents", [], async () => (isSelfService() ? [] : (await ifAllowed(api.get<ApiIndent[]>("/procurement/indents"), [])).map(toIndent)));
export const quotationStore = remoteStore<Quotation[]>("quotations", [], async () => (seesPurchasing() ? (await ifAllowed(api.get<ApiQuotation[]>("/procurement/quotations"), [])).map(toQuotation) : []));
export const poStore = remoteStore<PurchaseOrder[]>("purchase-orders", [], async () => (handlesGoods() ? (await ifAllowed(api.get<ApiPO[]>("/procurement/purchase-orders"), [])).map(toPO) : []));
export const grnStore = remoteStore<GoodsReceipt[]>("goods-receipts", [], async () => (handlesGoods() ? (await ifAllowed(api.get<ApiGRN[]>("/procurement/receipts"), [])).map(toGRN) : []));
export const vendorPaymentStore = remoteStore<VendorPayment[]>("vendor-payments", [], async () => (handlesPayables() ? (await ifAllowed(api.get<ApiPayment[]>("/payables/payments"), [])).map(toPayment) : []));
export const billStore = remoteStore<VendorBill[]>("vendor-bills", [], async () => {
  if (!handlesPayables()) return [];
  const [bills] = await Promise.all([ifAllowed(api.get<ApiBill[]>("/payables/bills"), []), vendorPaymentStore.load()]);
  const payments = vendorPaymentStore.get();
  return bills.map((b) => {
    const id = numId("bill", b.id);
    const paid = payments.find((p) => p.billId === id);
    return {
      id, poId: numId("po", b.poId), vendorId: numId("vendor", b.vendorId), billNo: b.billNo, billDate: b.billDate, subtotal: b.subtotal, gst: b.gst, total: b.total,
      expected: b.expected, status: b.status, enteredOn: b.createdAt.slice(0, 10), ...(b.note ? { note: b.note } : {}), ...(paid ? { paymentId: paid.id } : {}),
    };
  });
});
export const pettyCashStore = remoteStore<PettyCashVoucher[]>("petty-cash", [], async () => {
  if (!handlesPayables()) return [];
  const p = await ifAllowed(api.get<ApiPetty>("/petty-cash"), null);
  return (p?.vouchers ?? []).map((v) => ({
    id: numId("petty", v.id), date: v.voucherDate, kind: v.kind === "TOPUP" ? "topup" : "spend", purpose: v.purpose, paidTo: v.paidTo, category: v.category, amount: v.amount, approvedBy: v.approvedBy,
  }));
});

export const useProcurementSettings = () => procurementSettingsStore.useValue();
export const useVendors = () => vendorStore.useValue();
export const useIndents = () => indentStore.useValue();
export const useQuotations = () => quotationStore.useValue();
export const usePurchaseOrders = () => poStore.useValue();
export const useGoodsReceipts = () => grnStore.useValue();
export const useVendorBills = () => billStore.useValue();
export const useVendorPayments = () => vendorPaymentStore.useValue();
export const usePettyCash = () => pettyCashStore.useValue();

/** Every procurement list, for the preload. */
export const procurementStores = [procurementSettingsStore, vendorStore, indentStore, quotationStore, poStore, grnStore, vendorPaymentStore, billStore, pettyCashStore];

/** Reloads the lists an action may have changed (stock and expenses too). */
async function refresh(...extra: { load: (force?: boolean) => Promise<void> }[]) {
  await Promise.all([indentStore, quotationStore, poStore, grnStore, ...extra].map((s) => s.load(true).catch(() => undefined)));
}
const reloadStock = () => [itemStore, movementStore];
const reloadAccounts = () => [billStore, vendorPaymentStore, pettyCashStore, expenseStore];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Financial year "26-27" for a date (April–March). */
export function fyCode(date = today()) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** ₹1,108.80 — paise shown only when there are any. */
export const inr = (n: number) => `₹${n.toLocaleString("en-IN", Number.isInteger(round2(n)) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const indentGuid = (id: number) => guidOf("indent", id);

/** Value of what is still to be bought, at the estimated rates. */
export const purchaseEstimate = (i: Indent) => round2(i.lines.reduce((s, l) => s + (l.toPurchase ?? l.qty) * l.estRate, 0));

/** HOD of a department, if there is one (teachers with the HOD position). */
export function hodOf(department: string, teachers: { id: number; name: string; department: string; positions: string[] }[]) {
  return teachers.find((t) => t.department === department && t.positions.includes("Head of Department (HOD)"));
}

// ── Flow actions (each rejects with a readable Error when not allowed) ────────
// The `actor` arguments are kept for the pages; the server records the signed-in person.

export async function raiseIndent(
  input: Pick<Indent, "department" | "location" | "purpose" | "priority" | "neededBy" | "lines">,
  _requester: Actor & { teacherId?: number },
  _hod?: { id: number; name: string },
): Promise<Indent> {
  const lines = input.lines.filter((l) => l.name.trim() && l.qty > 0);
  if (!lines.length) throw new Error("Add at least one item with a quantity.");
  if (lines.some((l) => !Number.isFinite(l.estRate) || l.estRate < 0)) throw new Error("Estimated rates cannot be negative.");
  if (!input.purpose.trim()) throw new Error("Write why the items are needed.");
  const created = await api.post<ApiIndent>("/procurement/indents", {
    department: input.department, location: input.location, purpose: input.purpose.trim(), priority: input.priority.toUpperCase(), neededBy: input.neededBy,
    lines: lines.map((l) => ({ name: l.name.trim(), qty: l.qty, unit: l.unit, estRate: l.estRate, ...(l.itemId ? { inventoryItemId: maybeGuid("item", l.itemId) } : {}) })),
  });
  await refresh();
  return toIndent(created);
}

export async function cancelIndent(id: number, _actor: Actor, reason: string) {
  await api.post(`/procurement/indents/${indentGuid(id)}/cancel`, { reason });
  await refresh();
}

export async function hodDecision(id: number, _actor: Actor, approve: boolean, remark: string) {
  if (!approve && !remark.trim()) throw new Error("Give a reason for rejecting.");
  await api.post(`/procurement/indents/${indentGuid(id)}/hod`, { approve, remark });
  await refresh();
}

/**
 * Store check. For every line: how many to hand over from stock now (needs a linked inventory item
 * with enough quantity) and how many to buy. Stock is issued immediately.
 */
export async function storeCheck(id: number, _actor: Actor, decisions: { itemId?: number; category?: string; issue: number; estRate: number }[], remark: string) {
  await api.post(`/procurement/indents/${indentGuid(id)}/store-check`, {
    lines: decisions.map((d) => ({ issue: d.issue, estRate: d.estRate, inventoryItemId: d.itemId ? maybeGuid("item", d.itemId) ?? null : null, ...(d.category ? { category: d.category } : {}) })),
    remark,
  });
  await refresh(...reloadStock());
}

export async function principalDecision(id: number, _actor: Actor, approve: boolean, remark: string) {
  if (!approve && !remark.trim()) throw new Error("Give a reason for rejecting.");
  await api.post(`/procurement/indents/${indentGuid(id)}/principal`, { approve, remark });
  await refresh();
}

export async function managementDecision(id: number, _actor: Actor, approve: boolean, remark: string) {
  if (!approve && !remark.trim()) throw new Error("Give a reason for rejecting.");
  await api.post(`/procurement/indents/${indentGuid(id)}/management`, { approve, remark });
  await refresh();
}

export async function addQuotation(q: Omit<Quotation, "id" | "receivedOn">) {
  if (q.gstPercent < 0 || q.gstPercent > 28) throw new Error("GST must be between 0 and 28%.");
  await api.post(`/procurement/indents/${indentGuid(q.indentId)}/quotations`, {
    vendorId: guidOf("vendor", q.vendorId), gstPercent: q.gstPercent, deliveryDays: q.deliveryDays, validTill: q.validTill, notes: q.notes || undefined,
    lines: q.lines.filter((l) => l.rate > 0).map((l) => ({ lineNo: l.line, rate: l.rate })),
  });
  await refresh();
}

export async function removeQuotation(id: number) {
  await api.del(`/procurement/quotations/${guidOf("quotation", id)}`);
  await refresh();
}

/** Total of a quotation for what the indent still needs to buy, GST included. */
export function quotationTotal(q: Quotation, indent: Indent) {
  const sub = indent.lines.reduce((s, l, n) => s + (l.toPurchase ?? 0) * (q.lines.find((x) => x.line === n)?.rate ?? 0), 0);
  return { subtotal: round2(sub), gst: round2((sub * q.gstPercent) / 100), total: round2(sub * (1 + q.gstPercent / 100)) };
}

/** Raises the purchase order from the chosen quotation. A reason is required when it is not the lowest, or when there are too few quotations. */
export async function raisePurchaseOrder(indentId: number, quotationId: number, _actor: Actor, note: string): Promise<PurchaseOrder> {
  const res = await api.post<{ id: string; no: string }>(`/procurement/indents/${indentGuid(indentId)}/purchase-order`, { quotationId: guidOf("quotation", quotationId), note: note.trim() });
  await refresh();
  const po = poStore.get().find((p) => p.id === numId("po", res.id));
  if (!po) throw new Error(`${res.no} was raised, but could not be loaded — refresh the page.`);
  return po;
}

export async function cancelPurchaseOrder(poId: number, _actor: Actor, reason: string) {
  if (!reason.trim()) throw new Error("Give a reason.");
  await api.post(`/procurement/purchase-orders/${guidOf("po", poId)}/cancel`, { reason: reason.trim() });
  await refresh();
}

/**
 * Goods receipt (GRN): what arrived, what passed the quality check. Accepted quantities go into
 * stock (a new inventory item is created when the line has none).
 */
export async function receiveGoods(poId: number, _actor: Actor, input: { checkedBy: string; challanNo: string; lines: GRNLine[] }): Promise<GoodsReceipt> {
  if (!input.checkedBy.trim()) throw new Error("Who checked the quality? (usually the teacher who asked)");
  if (!input.challanNo.trim()) throw new Error("Enter the vendor's delivery challan number.");
  const res = await api.post<{ id: string; no: string }>(`/procurement/purchase-orders/${guidOf("po", poId)}/receipts`, {
    checkedBy: input.checkedBy.trim(), challanNo: input.challanNo.trim(),
    lines: input.lines.map((l) => ({ lineNo: l.line, received: l.received, accepted: l.accepted, ...(l.rejectedReason?.trim() ? { rejectedReason: l.rejectedReason.trim() } : {}) })),
  });
  await refresh(...reloadStock());
  const grn = grnStore.get().find((g) => g.id === numId("grn", res.id));
  return grn ?? { id: numId("grn", res.id), no: res.no, poId, date: today(), receivedBy: "", checkedBy: input.checkedBy, challanNo: input.challanNo, lines: input.lines };
}

/** Hands the received goods to the teacher / lab (stock out) and closes the indent. */
export async function issueToRequester(indentId: number, _actor: Actor) {
  await api.post(`/procurement/indents/${indentGuid(indentId)}/issue`, {});
  await refresh(...reloadStock());
}

/** Value the vendor may bill for: accepted quantity × PO rate, plus GST. */
export function receivedValue(po: PurchaseOrder) {
  const sub = po.lines.reduce((s, l) => s + l.accepted * l.rate, 0);
  return { subtotal: round2(sub), gst: round2((sub * po.gstPercent) / 100), total: round2(sub * (1 + po.gstPercent / 100)) };
}

/** Accountant enters the vendor's bill. Three-way match: PO rate × GRN accepted quantity vs the bill. */
export async function recordBill(input: { poId: number; billNo: string; billDate: string; subtotal: number; gst: number }): Promise<VendorBill> {
  if (!input.billNo.trim()) throw new Error("Enter the vendor's bill number.");
  if (!(input.subtotal > 0) || input.gst < 0) throw new Error("Enter the bill amounts.");
  const res = await api.post<ApiBill>("/payables/bills", { poId: guidOf("po", input.poId), billNo: input.billNo.trim(), billDate: input.billDate, subtotal: round2(input.subtotal), gst: round2(input.gst) });
  await billStore.load(true);
  const bill = billStore.get().find((b) => b.id === numId("bill", res.id));
  if (!bill) throw new Error("The bill was saved, but could not be loaded — refresh the page.");
  return bill;
}

/** A mismatched bill can still be approved with a written reason (e.g. freight agreed on phone), or put on hold. */
export async function decideBill(billId: number, action: "approve" | "hold", note: string) {
  await api.post(`/payables/bills/${guidOf("bill", billId)}/decision`, { action, note: note.trim() });
  await billStore.load(true);
}

const TDS_RATE: Record<TdsSection, number> = { None: 0, "194C": 2, "194J": 10, "194I": 10 };
/** Single-bill thresholds below which no TDS is deducted (₹). */
const TDS_THRESHOLD: Record<TdsSection, number> = { None: Infinity, "194C": 30000, "194J": 30000, "194I": 50000 };

/** TDS on the bill (on the amount before GST) — the same rule the server applies when paying. */
export function tdsFor(bill: VendorBill, vendor: Vendor) {
  const section = vendor.tdsSection;
  if (section === "None" || bill.subtotal < TDS_THRESHOLD[section]) return { section, rate: 0, amount: 0 };
  const rate = section === "194C" && vendor.isIndividual ? 1 : TDS_RATE[section];
  return { section, rate, amount: Math.round((bill.subtotal * rate) / 100) };
}

/** Pays an approved (or matched) bill: TDS withheld, the expense booked in Accounts. */
export async function payBill(billId: number, input: { mode: VendorPayment["mode"]; reference: string; date: string }): Promise<VendorPayment> {
  if (!input.reference.trim()) throw new Error("Enter the UTR / cheque number.");
  const res = await api.post<ApiPayment>(`/payables/bills/${guidOf("bill", billId)}/pay`, { mode: input.mode.toUpperCase(), reference: input.reference.trim(), paidOn: input.date });
  await Promise.all(reloadAccounts().map((s) => s.load(true).catch(() => undefined)));
  return toPayment(res);
}

// ── Petty cash ────────────────────────────────────────────────────────────────

export const pettyCashBalance = (list: PettyCashVoucher[]) => list.reduce((s, v) => s + (v.kind === "topup" ? v.amount : -v.amount), 0);

export async function spendPettyCash(v: Omit<PettyCashVoucher, "id" | "kind">) {
  if (!v.purpose.trim() || !v.paidTo.trim()) throw new Error("Enter what it was for and who was paid.");
  if (!(v.amount > 0)) throw new Error("Enter the amount.");
  await api.post("/petty-cash/spend", { purpose: v.purpose.trim(), paidTo: v.paidTo.trim(), category: v.category, amount: v.amount, date: v.date });
  await Promise.all([pettyCashStore, expenseStore].map((s) => s.load(true).catch(() => undefined)));
}

/** Refills the box back up to the float (imprest system). Resolves to the amount added. */
export async function topUpPettyCash(_approvedBy: string) {
  const res = await api.post<{ amount: number }>("/petty-cash/top-up", {});
  await pettyCashStore.load(true);
  return res.amount;
}

export async function saveVendor(v: Omit<Vendor, "id"> & { id?: number }) {
  if (!v.name.trim()) throw new Error("Vendor name is required.");
  if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.gstin.toUpperCase())) throw new Error("GSTIN looks wrong (15 characters, e.g. 09AAKFL1234M1Z5).");
  if (v.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan.toUpperCase())) throw new Error("PAN looks wrong (e.g. AAKFL1234M).");
  if (v.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc.toUpperCase())) throw new Error("IFSC looks wrong (e.g. HDFC0000123).");
  // bank details are sent only when entered in full (the list shows the account number masked)
  const bank = v.bankName && v.ifsc && v.accountNo && !MASKED_ACCOUNT.test(v.accountNo) ? { bankName: v.bankName, accountNo: v.accountNo.replace(/\s+/g, ""), ifsc: v.ifsc.toUpperCase() } : undefined;
  const body = {
    name: v.name.trim(), category: v.category || undefined, gstin: v.gstin.toUpperCase(), pan: v.pan.toUpperCase(), phone: v.phone || undefined, email: v.email,
    address: v.address || undefined, tdsSection: v.tdsSection === "None" ? "NONE" : v.tdsSection, isIndividual: v.isIndividual, isActive: v.active, ...(bank ? { bank } : {}),
  };
  if (v.id) await api.put(`/procurement/vendors/${guidOf("vendor", v.id)}`, body);
  else await api.post("/procurement/vendors", body);
  await vendorStore.load(true);
}

export async function updateProcurementSettings(patch: Partial<ProcurementSettings>) {
  const saved = await api.put<ProcurementSettings>("/procurement/settings", patch);
  procurementSettingsStore.set(saved);
}
