/**
 * Inventory, from the API: the item catalogue (GET /inventory/items — everyone in the school), stock
 * movements (GET /inventory/movements — the store keeper and principal) and settings (categories,
 * stores, units, alert level — GET/PUT /inventory/settings).
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { seedSettings } from "@/data/inventory";
import { today } from "@/lib/dates";
import type { InventoryItem, InventorySettings, StockMovement } from "@/types/inventory";
import { authStore, canAny } from "./auth";
import { ifAllowed, mutate, remoteCollection, remoteStore, tempId } from "./remote";

interface ApiItem { id: string; sku: string; name: string; category: string; unit: string; location: string; quantity: number; minQuantity: number; unitPrice: number; condition: string; lastUpdated: string | null }
interface ApiMovement { id: string; itemId: string; type: "IN" | "OUT"; quantity: number; note: string | null; by: string; date: string }

const title = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();
const toItem = (i: ApiItem): InventoryItem => ({
  id: numId("item", i.id), name: i.name, category: i.category, sku: i.sku, quantity: i.quantity, minQuantity: i.minQuantity, unit: i.unit,
  unitPrice: i.unitPrice, location: i.location, condition: (i.condition === "NEW" ? "Excellent" : i.condition === "DAMAGED" ? "Poor" : title(i.condition)) as InventoryItem["condition"],
  lastUpdated: i.lastUpdated ?? "",
});
const toMovement = (m: ApiMovement): StockMovement => ({ id: numId("movement", m.id), itemId: numId("item", m.itemId), type: m.type === "IN" ? "in" : "out", quantity: m.quantity, note: m.note ?? "", by: m.by, date: m.date });
const itemApi = (i: Omit<InventoryItem, "id" | "lastUpdated">) => ({
  sku: i.sku, name: i.name, category: i.category, unit: i.unit, location: i.location, minQuantity: Number(i.minQuantity), unitPrice: Number(i.unitPrice), condition: i.condition.toUpperCase(),
});

const itemBase = remoteCollection<InventoryItem>("inventory-items", async () => (await api.get<ApiItem[]>("/inventory/items")).map(toItem));
export const movementStore = remoteStore<StockMovement[]>("inventory-movements", [], async () =>
  canAny("inventory.manage", "reports.view") ? (await ifAllowed(api.get<ApiMovement[]>("/inventory/movements"), [])).map(toMovement) : []);
export const settingsStore = remoteStore<InventorySettings>("inventory-settings", seedSettings, async () => ({ ...seedSettings, ...((await api.get<InventorySettings | null>("/inventory/settings")) ?? {}) }));

/** Posts a stock movement and applies the server's new quantity. */
async function postMovement(itemId: number, type: "in" | "out", quantity: number, note: string) {
  const res = await api.post<{ item: ApiItem; movement: ApiMovement }>(`/inventory/items/${guidOf("item", itemId)}/movements`, { type: type.toUpperCase(), quantity, note: note || null });
  itemBase.set((list) => list.map((i) => (i.id === itemId ? toItem(res.item) : i)));
  return res.movement;
}

export const itemStore = Object.assign(itemBase, {
  add(record: Omit<InventoryItem, "id">): InventoryItem {
    const id = tempId();
    const created = { ...record, id };
    void mutate(itemBase, (l) => [...l, created], async () => {
      const saved = await api.post<ApiItem>("/inventory/items", { ...itemApi(record), quantity: Number(record.quantity) });
      itemBase.set((l) => l.map((x) => (x.id === id ? toItem(saved) : x)));
      void movementStore.load(true);
    });
    return created;
  },
  /** Saves details; a changed quantity is recorded as a stock adjustment. */
  update(record: InventoryItem) {
    const before = itemBase.getAll().find((x) => x.id === record.id);
    void mutate(itemBase, (l) => l.map((x) => (x.id === record.id ? record : x)), async () => {
      await api.patch(`/inventory/items/${guidOf("item", record.id)}`, itemApi(record));
      const diff = before ? record.quantity - before.quantity : 0;
      if (diff) {
        const m = await postMovement(record.id, diff > 0 ? "in" : "out", Math.abs(diff), "Stock adjusted");
        movementStore.set((list) => [toMovement(m), ...list]);
      }
    });
  },
  remove(id: number) {
    void mutate(itemBase, (l) => l.filter((x) => x.id !== id), () => api.del(`/inventory/items/${guidOf("item", id)}`));
  },
});

export const useItems = () => itemBase.useItems();
export const useMovements = () => movementStore.useValue();
export const useInventorySettings = () => settingsStore.useValue();

export function updateSettings(patch: Partial<InventorySettings>) {
  void mutate(settingsStore, (s) => ({ ...s, ...patch }), () => api.put("/inventory/settings", settingsStore.get()));
}

export type StockLevel = "ok" | "low" | "critical";

export function stockLevel(item: InventoryItem, criticalPercent: number): StockLevel {
  if (item.minQuantity <= 0 || item.quantity >= item.minQuantity) return "ok";
  return (item.quantity / item.minQuantity) * 100 < criticalPercent ? "critical" : "low";
}

/** Records stock in/out and updates the item. Returns an error message if it cannot be applied. */
export function recordMovement(itemId: number, type: "in" | "out", quantity: number, note: string, by: string): string | null {
  const item = itemStore.getAll().find((i) => i.id === itemId);
  if (!item) return "Item not found";
  if (!Number.isInteger(quantity) || quantity <= 0) return "Quantity must be a whole number above 0";
  if (type === "out" && quantity > item.quantity) return `Only ${item.quantity} ${item.unit} in stock`;
  const id = tempId();
  const local: StockMovement = { id, itemId, type, quantity, note, by: by || authStore.get().me?.user.name || "", date: today() };
  itemBase.set((list) => list.map((i) => (i.id === itemId ? { ...i, quantity: i.quantity + (type === "in" ? quantity : -quantity), lastUpdated: today() } : i)));
  void mutate(movementStore, (list) => [local, ...list], async () => {
    const m = await postMovement(itemId, type, quantity, note);
    movementStore.set((list) => list.map((x) => (x.id === id ? toMovement(m) : x)));
    return true;
  }).then((ok) => { if (!ok) void itemBase.load(true); });
  return null;
}

export function formatINR(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Figures shared by the inventory dashboard, reports and the principal's inventory page. */
export function inventorySummary(items: InventoryItem[], movements: StockMovement[], settings: InventorySettings) {
  const value = (i: InventoryItem) => i.quantity * i.unitPrice;
  const categoryNames = [...new Set([...settings.categories.map((c) => c.name), ...items.map((i) => i.category)])];
  const categories = categoryNames.map((name) => {
    const inCat = items.filter((i) => i.category === name);
    return {
      name,
      items: inCat.length,
      units: inCat.reduce((a, i) => a + i.quantity, 0),
      value: inCat.reduce((a, i) => a + value(i), 0),
      low: inCat.filter((i) => stockLevel(i, settings.criticalPercent) !== "ok").length,
    };
  });
  const lowStock = items
    .filter((i) => stockLevel(i, settings.criticalPercent) !== "ok")
    .map((i) => ({ ...i, level: stockLevel(i, settings.criticalPercent) }))
    .sort((a, b) => a.quantity / a.minQuantity - b.quantity / b.minQuantity);
  const recent = [...movements].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map((m) => {
    const item = items.find((i) => i.id === m.itemId);
    return { ...m, itemName: item?.name ?? "Deleted item", category: item?.category ?? "—", unit: item?.unit ?? "" };
  });
  return {
    totalItems: items.length,
    totalUnits: items.reduce((a, i) => a + i.quantity, 0),
    totalValue: items.reduce((a, i) => a + value(i), 0),
    categoryCount: categoryNames.length,
    categories,
    lowStock,
    recent,
  };
}

/** Downloads rows as a CSV file. */
export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
