export type ItemCondition = "Excellent" | "Good" | "Fair" | "Poor";

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  sku: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  /** ₹ per unit */
  unitPrice: number;
  location: string;
  condition: ItemCondition;
  /** YYYY-MM-DD */
  lastUpdated: string;
}

export interface StockMovement {
  id: number;
  itemId: number;
  type: "in" | "out";
  quantity: number;
  note: string;
  by: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface InventorySettings {
  categories: { name: string; description: string }[];
  warehouses: string[];
  units: string[];
  users: { name: string; role: string }[];
  school: { name: string; address: string; phone: string; email: string };
  /** Show low-stock alerts on dashboards. */
  lowStockAlerts: boolean;
  /** Below this % of the minimum quantity an item is "critical". */
  criticalPercent: number;
}
