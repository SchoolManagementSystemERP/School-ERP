import type { InventorySettings } from "@/types/inventory";

/** Defaults until the school saves its own inventory settings. */
export const seedSettings: InventorySettings = {
  categories: [
    { name: "Computers", description: "Laptops, desktops and accessories" },
    { name: "Electronics", description: "Projectors, smart boards, AV equipment" },
    { name: "Furniture", description: "Desks, chairs, cupboards" },
    { name: "Office Equipment", description: "Printers, copiers, office machines" },
    { name: "Lab Equipment", description: "Science lab apparatus" },
    { name: "Stationery", description: "Consumables for classrooms and office" },
    { name: "Sports Equipment", description: "Games and PE equipment" },
  ],
  warehouses: ["Main Storage", "IT Store Room", "Admin Block", "AV Room", "Science Lab", "Supply Closet", "Sports Store"],
  units: ["pcs", "sets", "boxes", "packs", "kg", "litres"],
  users: [
    { name: "Inventory Admin", role: "Inventory Manager" },
    { name: "Store Keeper", role: "Store Keeper" },
    { name: "Dr. Priya Sharma", role: "Approver (Principal)" },
  ],
  school: { name: "Delhi Public School", address: "Sector 12, Lucknow, Uttar Pradesh", phone: "+91 522 400 1234", email: "office@dps.edu.in" },
  lowStockAlerts: true,
  criticalPercent: 50,
};
