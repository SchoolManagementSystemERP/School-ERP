import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { updateSettings, useInventorySettings } from "@/store/inventory";

export function SystemSettings() {
  const settings = useInventorySettings();
  const [school, setSchool] = useState(settings.school);

  return (
    <div className="space-y-6">
      <PageHeader title="System" description="School profile and backups" />

      <Card>
        <CardHeader><CardTitle className="text-base">School Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["name", "address", "phone", "email"] as const).map((k) => (
              <div key={k} className="space-y-2">
                <Label className="capitalize">{k}</Label>
                <Input value={school[k]} onChange={(e) => setSchool({ ...school, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button className="gap-2" onClick={() => { updateSettings({ school }); toast.success("School profile saved"); }}><Save className="h-4 w-4" /> Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Data & Backups</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>All school data is kept in the school's SQL Server database, not in this browser — every device sees the same records.</p>
          <p>The database is backed up automatically: a full backup every night and the transaction log every hour (see <span className="font-mono text-xs">backend/database/maintenance</span>). Every change is also written to the audit log.</p>
        </CardContent>
      </Card>
    </div>
  );
}
