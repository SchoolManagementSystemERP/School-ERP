// src/app/pages/principal/AcademicYear.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2, CalendarDays, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type AcademicYearData = {
  id: number;
  yearLabel: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

const INITIAL_YEARS: AcademicYearData[] = [
  { id: 1, yearLabel: "2023-24", startDate: "2023-04-01", endDate: "2024-03-31", isActive: false },
  { id: 2, yearLabel: "2024-25", startDate: "2024-04-01", endDate: "2025-03-31", isActive: false },
  { id: 3, yearLabel: "2025-26", startDate: "2025-04-01", endDate: "2026-03-31", isActive: true },
];

export function AcademicYear() {
  const [years, setYears] = useState<AcademicYearData[]>(INITIAL_YEARS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYearData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    yearLabel: "",
    startDate: "",
    endDate: "",
    isActive: false,
  });

  const resetForm = () => {
    setFormData({ yearLabel: "", startDate: "", endDate: "", isActive: false });
    setEditingYear(null);
  };

  const handleOpenDialog = (year?: AcademicYearData) => {
    if (year) {
      setEditingYear(year);
      setFormData({
        yearLabel: year.yearLabel,
        startDate: year.startDate,
        endDate: year.endDate,
        isActive: year.isActive,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.yearLabel.trim() || !formData.startDate || !formData.endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      toast.error("End date must be after start date");
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    if (editingYear) {
      setYears(prev =>
        prev.map(y => {
          if (y.id === editingYear.id) return { ...y, ...formData };
          // agar naya entry active hai toh baaki sab ko inactive karo
          if (formData.isActive) return { ...y, isActive: false };
          return y;
        })
      );
      toast.success("Academic year updated successfully!");
    } else {
      const newYear: AcademicYearData = { id: Date.now(), ...formData };
      setYears(prev => {
        const updated = formData.isActive
          ? prev.map(y => ({ ...y, isActive: false }))
          : prev;
        return [...updated, newYear];
      });
      toast.success("Academic year created successfully!");
    }

    setIsDialogOpen(false);
    resetForm();
    setIsSubmitting(false);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this academic year?")) {
      setYears(prev => prev.filter(y => y.id !== id));
      toast.success("Academic year deleted successfully");
    }
  };

  const handleSetActive = (id: number) => {
    setYears(prev =>
      prev.map(y => ({ ...y, isActive: y.id === id }))
    );
    toast.success("Active academic year updated!");
  };

  const activeYear = years.find(y => y.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Academic Year</h1>
          <p className="text-muted-foreground">Manage and set active academic sessions</p>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="gap-2 bg-violet-600 hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Add Academic Year
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-semibold">{years.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Year</p>
              <p className="text-2xl font-semibold">{activeYear?.yearLabel ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Academic Years ({years.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">Year</th>
                  <th className="text-left p-4 font-medium">Start Date</th>
                  <th className="text-left p-4 font-medium">End Date</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-center p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {years.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                      No academic years found. Add your first session.
                    </td>
                  </tr>
                ) : (
                  years.map(year => (
                    <tr key={year.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-semibold">{year.yearLabel}</td>
                      <td className="p-4">{year.startDate}</td>
                      <td className="p-4">{year.endDate}</td>
                      <td className="p-4">
                        {year.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          {!year.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700 text-xs"
                              onClick={() => handleSetActive(year.id)}
                            >
                              Set Active
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(year)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(year.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingYear ? "Edit Academic Year" : "Add Academic Year"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="yearLabel">Year Label</Label>
              <Input
                id="yearLabel"
                placeholder="e.g. 2026-27"
                value={formData.yearLabel}
                onChange={e => setFormData({ ...formData, yearLabel: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.isActive ? "active" : "inactive"}
                onValueChange={value =>
                  setFormData({ ...formData, isActive: value === "active" })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingYear ? "Update Year" : "Create Year"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}