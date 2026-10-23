import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { sectionName, sectionStore, useGrades, useSections, type Section } from "@/store/classes";
import { useClassRoster } from "@/store/students";
import { useTeachers } from "@/store/teachers";

type SectionData = Section & { currentStrength: number };

export function SectionSetup() {
  const { byClass } = useClassRoster();
  const grades = useGrades();
  const { teachers } = useTeachers();
  const sections: SectionData[] = useSections().map((sec) => ({ ...sec, currentStrength: byClass[sectionName(sec)]?.length ?? 0 }));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    className: "",
    section: "",
    academicYear: "2025-26",
    classTeacher: "",
    medium: "English",        // ← Default
    capacity: 40,
  });

  const resetForm = () => {
    setFormData({
      className: "",
      section: "",
      academicYear: "2025-26",
      classTeacher: "",
      medium: "English",
      capacity: 40,
    });
    setEditingSection(null);
  };

  const handleOpenDialog = (sec?: SectionData) => {
    if (sec) {
      setEditingSection(sec);
      setFormData({
        className: sec.className,
        section: sec.section,
        academicYear: sec.academicYear,
        classTeacher: sec.classTeacher,
        medium: sec.medium,
        capacity: sec.capacity,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSaveSection = async () => {
    if (!formData.className || !formData.section || !formData.classTeacher || !formData.medium) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 400));

    if (editingSection) {
      const { currentStrength, ...current } = editingSection;
      if (sectionName(formData) !== sectionName(current) && currentStrength > 0) {
        toast.error(`${sectionName(current)} has ${currentStrength} students — move them before renaming it`);
        setIsSubmitting(false);
        return;
      }
      sectionStore.update({ ...current, ...formData, capacity: Number(formData.capacity) });
      toast.success("Section updated successfully!");
    } else {
      const section = formData.section.trim().toUpperCase();
      if (sections.some((sec) => sectionName(sec) === sectionName({ ...formData, section }))) {
        toast.error(`${sectionName({ ...formData, section })} already exists`);
        setIsSubmitting(false);
        return;
      }
      sectionStore.add({ ...formData, section, capacity: Number(formData.capacity) });
      toast.success("New section added successfully!");
    }

    setIsDialogOpen(false);
    resetForm();
    setIsSubmitting(false);
  };

  const handleDeleteSection = (id: number) => {
    const sec = sections.find((x) => x.id === id);
    if (sec && sec.currentStrength > 0) {
      toast.error(`${sectionName(sec)} has ${sec.currentStrength} students — move them before deleting it`);
      return;
    }
    if (window.confirm("Delete this section?")) {
      sectionStore.remove(id);
      toast.success("Section deleted successfully");
    }
  };

  // Group by Class
  const groupedByClass = sections.reduce((acc, sec) => {
    if (!acc[sec.className]) acc[sec.className] = [];
    acc[sec.className].push(sec);
    return acc;
  }, {} as Record<string, SectionData[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Section Management</h1>
          <p className="text-muted-foreground">Manage sections for each class</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-violet-600 hover:bg-violet-700">
          <Plus className="h-4 w-4" />
          Add New Section
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Layers className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Sections</p>
              <p className="text-2xl font-semibold">{sections.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Students</p>
              <p className="text-2xl font-semibold">
                {sections.reduce((sum, s) => sum + s.currentStrength, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sections by Class */}
      <div className="space-y-6">
        {Object.entries(groupedByClass).map(([className, classSections]) => (
          <Card key={className}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {className}
                <Badge variant="secondary">{classSections.length} Sections</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4">Section</th>
                      <th className="text-left p-4">Medium</th>
                      <th className="text-left p-4">Class Teacher</th>
                      <th className="text-center p-4">Capacity</th>
                      <th className="text-center p-4">Strength</th>
                      <th className="text-center p-4">Occupancy</th>
                      <th className="text-center p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classSections.map((sec) => {
                      const occupancy = Math.round((sec.currentStrength / sec.capacity) * 100);
                      return (
                        <tr key={sec.id} className="border-b hover:bg-muted/30">
                          <td className="p-4">
                            <Badge variant="outline" className="font-mono text-base px-3 py-1">
                              {sec.section}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Badge variant="secondary">{sec.medium}</Badge>
                          </td>
                          <td className="p-4">{sec.classTeacher}</td>
                          <td className="p-4 text-center">{sec.capacity}</td>
                          <td className="p-4 text-center font-medium">{sec.currentStrength}</td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${occupancy > 90 ? 'bg-red-500' : occupancy > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${occupancy}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium">{occupancy}%</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(sec)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteSection(sec.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? "Edit Section" : "Add New Section"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Class</Label>
              <Select
                value={formData.className}
                onValueChange={(value) => setFormData({ ...formData, className: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => g.className).map((cls) => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Section</Label>
              <Input
                placeholder="A, B, C..."
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                maxLength={2}
              />
            </div>

            <div>
              <Label>Medium</Label>
              <Select
                value={formData.medium}
                onValueChange={(value) => setFormData({ ...formData, medium: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Medium" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Hindi">Hindi</SelectItem>
                  <SelectItem value="Bengali">Bengali</SelectItem>
                  <SelectItem value="Marathi">Marathi</SelectItem>
                  <SelectItem value="Tamil">Tamil</SelectItem>
                  <SelectItem value="Telugu">Telugu</SelectItem>
                  <SelectItem value="Kannada">Kannada</SelectItem>
                  <SelectItem value="Gujarati">Gujarati</SelectItem>
                  <SelectItem value="Malayalam">Malayalam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Class Teacher</Label>
              <Select value={formData.classTeacher} onValueChange={(value) => setFormData({ ...formData, classTeacher: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([formData.classTeacher, ...teachers.map((t) => t.name)].filter(Boolean))].map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                min={10}
                max={100}
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 40 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveSection} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingSection ? "Update Section" : "Add Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}