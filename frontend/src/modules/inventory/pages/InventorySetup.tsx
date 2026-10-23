import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateSettings, useInventorySettings, useItems } from "@/store/inventory";
import { CategoryEditor, ListEditor } from "@/modules/inventory/components/SetupEditors";

const SECTIONS = [
  { id: "warehouses", label: "Warehouses" },
  { id: "units", label: "Units & Measures" },
  { id: "item-categories", label: "Item Categories" },
  { id: "users", label: "Users & Roles" },
  { id: "school", label: "School Info" },
  { id: "academic-years", label: "Academic Years" },
  { id: "notifications", label: "Notifications" },
];

/**
 * Inventory configuration. Used at /inventory/setup/:section and on the principal's Inventory Setup page.
 */
export function InventorySetup() {
  const section = useParams()["*"];
  const [tab, setTab] = useState(SECTIONS.some((s) => s.id === section) ? section! : "warehouses");
  // follow the sidebar's setup links
  useEffect(() => { if (section && SECTIONS.some((s) => s.id === section)) setTab(section); }, [section]);

  const settings = useInventorySettings();
  const items = useItems();
  const [school, setSchool] = useState(settings.school);
  const [newUser, setNewUser] = useState({ name: "", role: "" });

  const addUser = () => {
    if (!newUser.name.trim() || !newUser.role.trim()) { toast.error("Name and role are required"); return; }
    updateSettings({ users: [...settings.users, { name: newUser.name.trim(), role: newUser.role.trim() }] });
    setNewUser({ name: "", role: "" });
    toast.success("User added");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Inventory Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">Warehouses, units, categories and other inventory settings</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          {SECTIONS.map((s) => <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="warehouses" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Warehouses & Storage Locations</CardTitle></CardHeader>
            <CardContent>
              <ListEditor
                values={settings.warehouses}
                onChange={(warehouses) => updateSettings({ warehouses })}
                placeholder="e.g. Library Store"
                usage={(w) => items.filter((i) => i.location === w).length}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Units & Measures</CardTitle></CardHeader>
            <CardContent>
              <ListEditor
                values={settings.units}
                onChange={(units) => updateSettings({ units })}
                placeholder="e.g. dozen"
                usage={(u) => items.filter((i) => i.unit === u).length}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="item-categories" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Item Categories</CardTitle></CardHeader>
            <CardContent><CategoryEditor /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Users & Roles</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
                <Input placeholder="Role, e.g. Store Keeper" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} />
                <Button onClick={addUser} className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="divide-y divide-border border border-border rounded-lg">
                {settings.users.map((u, i) => (
                  <div key={`${u.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-foreground/60">{u.role}</p>
                    </div>
                    <Button
                      variant="ghost" size="sm" className="text-destructive"
                      onClick={() => { updateSettings({ users: settings.users.filter((_, j) => j !== i) }); toast.success("User removed"); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="school" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">School Info</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-foreground/60">Printed on purchase orders and stock reports.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(["name", "address", "phone", "email"] as const).map((k) => (
                  <div key={k} className="space-y-2">
                    <Label className="capitalize">{k}</Label>
                    <Input value={school[k]} onChange={(e) => setSchool({ ...school, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <Button className="gap-2" onClick={() => { updateSettings({ school }); toast.success("School info saved"); }}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic-years" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Academic Years</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-foreground">Current academic year: <strong>2025-26</strong> (April 2025 – March 2026)</p>
              <p className="text-foreground/60">Stock reports and valuations are grouped by the current academic year. Academic years are managed by the principal under Setup → Academic Year.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Low-stock alerts</p>
                  <p className="text-xs text-foreground/60">Show items below their minimum quantity on the dashboards.</p>
                </div>
                <Switch checked={settings.lowStockAlerts} onCheckedChange={(v) => updateSettings({ lowStockAlerts: v })} />
              </div>
              <div className="space-y-2 max-w-xs">
                <Label>Critical level (% of minimum quantity)</Label>
                <Input
                  type="number" min={1} max={100} value={settings.criticalPercent}
                  onChange={(e) => updateSettings({ criticalPercent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                />
                <p className="text-xs text-foreground/60">Items below {settings.criticalPercent}% of their minimum are marked Critical.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
