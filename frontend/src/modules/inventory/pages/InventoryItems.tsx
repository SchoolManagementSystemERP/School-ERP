import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, Trash2, Package, ArrowDownUp } from "lucide-react";
import { toast } from "sonner";
import {
  formatINR, itemStore, recordMovement, stockLevel, useInventorySettings, useItems,
} from "@/store/inventory";
import type { InventoryItem, ItemCondition } from "@/types/inventory";

const CONDITIONS: ItemCondition[] = ["Excellent", "Good", "Fair", "Poor"];
const CURRENT_USER = "Inventory Admin";

const emptyForm = {
  name: "", sku: "", category: "", quantity: "", minQuantity: "", unit: "pcs", unitPrice: "", location: "", condition: "Good" as ItemCondition,
};

export function InventoryItems() {
  const items = useItems();
  const settings = useInventorySettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  // stock in / out dialog
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [stock, setStock] = useState({ type: "in" as "in" | "out", quantity: "", note: "" });

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, location: settings.warehouses[0] ?? "" });
    setIsFormOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name, sku: item.sku, category: item.category, quantity: String(item.quantity),
      minQuantity: String(item.minQuantity), unit: item.unit, unitPrice: String(item.unitPrice),
      location: item.location, condition: item.condition,
    });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    const quantity = Number(form.quantity), minQuantity = Number(form.minQuantity), unitPrice = Number(form.unitPrice);
    if (!form.name.trim() || !form.sku.trim() || !form.category || !form.location) {
      toast.error("Name, SKU, category and location are required");
      return;
    }
    if ([quantity, minQuantity, unitPrice].some((n) => Number.isNaN(n) || n < 0)) {
      toast.error("Quantity, minimum and price must be 0 or more");
      return;
    }
    const sku = form.sku.trim().toUpperCase();
    if (items.some((i) => i.sku === sku && i.id !== editingId)) {
      toast.error(`SKU ${sku} is already used`);
      return;
    }
    const record = {
      name: form.name.trim(), sku, category: form.category, quantity, minQuantity, unit: form.unit,
      unitPrice, location: form.location, condition: form.condition, lastUpdated: new Date().toISOString().slice(0, 10),
    };
    if (editingId === null) {
      itemStore.add(record);
      toast.success("Item added successfully!");
    } else {
      itemStore.update({ ...record, id: editingId });
      toast.success("Item updated successfully!");
    }
    setIsFormOpen(false);
  };

  const handleDeleteItem = (item: InventoryItem) => {
    itemStore.remove(item.id);
    toast.success(`${item.name} deleted`);
  };

  const handleStock = () => {
    if (!stockItem) return;
    const error = recordMovement(stockItem.id, stock.type, Number(stock.quantity), stock.note.trim() || (stock.type === "in" ? "Stock received" : "Stock issued"), CURRENT_USER);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${stock.type === "in" ? "Added" : "Removed"} ${stock.quantity} ${stockItem.unit} of ${stockItem.name}`);
    setStockItem(null);
  };

  const getStockStatus = (item: InventoryItem) => {
    const level = stockLevel(item, settings.criticalPercent);
    if (level === "critical") return <Badge variant="destructive">Critical</Badge>;
    if (level === "low") return <Badge className="bg-orange-600">Low Stock</Badge>;
    return <Badge variant="default" className="bg-green-600">In Stock</Badge>;
  };

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input {...props} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Inventory Items</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all inventory items and stock levels</p>
        </div>
        <Button className="gap-2" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add New Item
        </Button>
      </div>

      {/* Add / edit dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId === null ? "Add New Inventory Item" : "Edit Inventory Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            {field("name", "Item Name", { placeholder: "Enter item name" })}
            {field("sku", "SKU", { placeholder: "e.g. COMP-002" })}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {settings.categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v })}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {settings.warehouses.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field("quantity", "Quantity", { type: "number", min: 0, placeholder: "Enter quantity" })}
            {field("minQuantity", "Minimum Quantity", { type: "number", min: 0, placeholder: "Reorder level" })}
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {settings.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field("unitPrice", "Unit Price (₹)", { type: "number", min: 0, placeholder: "Enter unit price" })}
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v: ItemCondition) => setForm({ ...form, condition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId === null ? "Add Item" : "Save Changes"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock in / out dialog */}
      <Dialog open={!!stockItem} onOpenChange={(open) => !open && setStockItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Stock — {stockItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-foreground/60">Current stock: <strong>{stockItem?.quantity} {stockItem?.unit}</strong></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={stock.type} onValueChange={(v: "in" | "out") => setStock({ ...stock, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Stock In</SelectItem>
                    <SelectItem value="out">Stock Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={stock.quantity} onChange={(e) => setStock({ ...stock, quantity: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input placeholder="e.g. Issued to Class 10-A" value={stock.note} onChange={(e) => setStock({ ...stock, note: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleStock}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                type="text"
                placeholder="Search by item name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {settings.categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredItems.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="secondary">{item.category}</Badge>
                      {getStockStatus(item)}
                      <span className="text-sm text-foreground/60">SKU: {item.sku}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setStock({ type: "in", quantity: "", note: "" }); setStockItem(item); }}>
                    <ArrowDownUp className="h-4 w-4" /> Stock
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-foreground/60">Current Stock</p>
                  <p className="font-semibold text-foreground text-lg">{item.quantity} <span className="text-sm font-normal">{item.unit}</span></p>
                </div>
                <div>
                  <p className="text-foreground/60">Min. Required</p>
                  <p className="font-semibold text-foreground text-lg">{item.minQuantity}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Unit Price</p>
                  <p className="font-semibold text-foreground text-lg">{formatINR(item.unitPrice)}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Total Value</p>
                  <p className="font-semibold text-foreground text-lg">{formatINR(item.quantity * item.unitPrice)}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Location</p>
                  <p className="font-medium text-foreground">{item.location}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Condition</p>
                  <p className="font-medium text-foreground">{item.condition}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-foreground/60">Last Updated</p>
                  <p className="font-medium text-foreground">{item.lastUpdated}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="h-12 w-12 text-foreground/30 mx-auto mb-4" />
            <p className="text-foreground/60">No items found matching your criteria</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
