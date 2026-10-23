import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarIcon, Eye, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { addAssignment, assignmentStatus, gradeSubmission, removeAssignment, useAssignments } from "@/store/assignments";
import { teacherClasses, teacherSubjects, useCurrentTeacher } from "@/store/session";
import { useClassRoster } from "@/store/students";
import type { Assignment, AssignmentStatus } from "@/types/assignment";

type AssignmentRow = Assignment & { status: AssignmentStatus; totalStudents: number; submissionCount: number };

export function Assignments() {
  const teacher = useCurrentTeacher();
  const mySubjects = teacherSubjects(teacher);
  const { classes: allClasses, byClass } = useClassRoster();
  const classes = teacherClasses(teacher, allClasses);
  const assignments: AssignmentRow[] = useAssignments().map((a) => ({
    ...a,
    status: assignmentStatus(a),
    totalStudents: byClass[a.class]?.length ?? 0,
    submissionCount: a.submissions.length,
  }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedAssignment = assignments.find((a) => a.id === selectedId) ?? null;
  // grading drafts: studentId → { marks, feedback }
  const [grades, setGrades] = useState<Record<number, { marks: string; feedback: string }>>({});
  const [dueDate, setDueDate] = useState<Date>();
  
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");

  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    class: "",
    description: "",
    totalMarks: "",
  });

  const handleCreateAssignment = () => {
    if (!formData.title || !formData.subject || !formData.class || !dueDate) {
      toast.error("Please fill all required fields");
      return;
    }

    addAssignment({
      ...formData,
      teacher: teacher?.name ?? "",
      totalMarks: parseInt(formData.totalMarks) || 100,
      dueDate: format(dueDate, "yyyy-MM-dd"),
    });
    toast.success("Assignment created successfully!");
    setDialogOpen(false);
    setFormData({ title: "", subject: "", class: "", description: "", totalMarks: "" });
    setDueDate(undefined);
  };

  const handleDeleteAssignment = (id: number) => {
    removeAssignment(id);
    toast.success("Assignment deleted successfully!");
  };

  const handleViewAssignment = (assignment: AssignmentRow) => {
    setSelectedId(assignment.id);
    setGrades(Object.fromEntries(assignment.submissions.map((s) => [s.studentId, { marks: s.marksObtained?.toString() ?? "", feedback: s.feedback ?? "" }])));
    setPreviewOpen(true);
  };

  const handleSaveGrade = (studentId: number) => {
    if (!selectedAssignment) return;
    const g = grades[studentId];
    const marks = Number(g?.marks);
    if (g?.marks === "" || Number.isNaN(marks) || marks < 0 || marks > selectedAssignment.totalMarks) {
      toast.error(`Enter marks between 0 and ${selectedAssignment.totalMarks}`);
      return;
    }
    gradeSubmission(selectedAssignment.id, studentId, marks, g.feedback.trim());
    toast.success("Grade saved. The student can see it now.");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 dark:bg-green-950 dark:text-green-400 text-green-800";
      case "upcoming": return "bg-blue-100 dark:bg-blue-950 dark:text-blue-400 text-blue-800";
      case "closed": return "bg-muted text-foreground";
      default: return "bg-muted text-foreground";
    }
  };

  // Filter only teacher's subjects
  const filteredAssignments = assignments.filter(assignment => {
    const classMatch = filterClass === "all" || assignment.class === filterClass;
    const subjectMatch = filterSubject === "all" || assignment.subject === filterSubject;
    const teacherSubject = mySubjects.includes(assignment.subject) || assignment.teacher === teacher?.name;
    return classMatch && subjectMatch && teacherSubject;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
            Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage assignments • {mySubjects.join(", ")}
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Create Assignment
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md mx-4">
            <DialogHeader>
              <DialogTitle>Create New Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Title *</Label>
                <Input 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Assignment title"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Subject *</Label>
                  <Select value={formData.subject} onValueChange={(value) => setFormData({...formData, subject: value})}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      {mySubjects.map(subject => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Class *</Label>
                  <Select value={formData.class} onValueChange={(value) => setFormData({...formData, class: value})}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      {classes.map(cls => (
                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Assignment instructions"
                  className="mt-2"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Total Marks</Label>
                  <Input 
                    type="number"
                    value={formData.totalMarks}
                    onChange={(e) => setFormData({...formData, totalMarks: e.target.value})}
                    placeholder="100"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Due Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start mt-2">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "PPP") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Button className="w-full" onClick={handleCreateAssignment}>
                Create Assignment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Assignments</p>
            <p className="text-3xl font-semibold text-foreground mt-1">
              {filteredAssignments.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-3xl font-semibold text-green-600 mt-1">
              {filteredAssignments.filter(a => a.status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Submissions</p>
            <p className="text-3xl font-semibold text-orange-600 mt-1">
              {filteredAssignments.reduce((acc, a) => acc + a.submissionCount, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Select Class</label>
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger>
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(cls => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Select Subject</label>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  <SelectItem value="all">All My Subjects</SelectItem>
                  {mySubjects.map(subject => (
                    <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => { setFilterClass("all"); setFilterSubject("all"); }}>
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignments List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredAssignments.map((assignment) => (
          <Card key={assignment.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-base sm:text-lg">
                    {assignment.title}
                  </h3>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline" className="dark:bg-gray-800">{assignment.subject}</Badge>
                    <Badge variant="outline" className="dark:bg-gray-800">{assignment.class}</Badge>
                    <Badge className={getStatusColor(assignment.status)}>
                      {assignment.status}
                    </Badge>
                  </div>

                  {assignment.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {assignment.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-muted-foreground">
                    <span>Due: <span className="font-medium text-foreground">
                      {format(new Date(assignment.dueDate), "PPP")}
                    </span></span>
                    <span>Marks: <span className="font-medium text-foreground">{assignment.totalMarks}</span></span>
                    <span>Submissions: <span className="font-medium text-foreground">
                      {assignment.submissionCount}/{assignment.totalStudents}
                    </span></span>
                  </div>
                </div>

                <div className="flex flex-row sm:flex-col gap-2 mt-4 sm:mt-0">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => handleViewAssignment(assignment)}>
                    <Eye className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDeleteAssignment(assignment.id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 flex-1 sm:flex-none"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredAssignments.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No assignments found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{selectedAssignment?.title}</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          {selectedAssignment && (
            <div className="space-y-6 py-4">
              <div className="flex gap-3 flex-wrap">
                <Badge variant="outline">{selectedAssignment.subject}</Badge>
                <Badge variant="outline">{selectedAssignment.class}</Badge>
                <Badge className={getStatusColor(selectedAssignment.status)}>
                  {selectedAssignment.status}
                </Badge>
              </div>

              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-foreground/80 leading-relaxed">
                  {selectedAssignment.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Due Date</p>
                  <p className="font-medium">{format(new Date(selectedAssignment.dueDate), "PPP")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Marks</p>
                  <p className="font-medium">{selectedAssignment.totalMarks}</p>
                </div>
              </div>

              <div className="bg-muted/50 border border-border rounded-lg p-5">
                <p className="text-sm text-muted-foreground">Submissions</p>
                <p className="text-2xl font-semibold mt-1">
                  {selectedAssignment.submissionCount} / {selectedAssignment.totalStudents} students
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Submissions &amp; Grading</h4>
                {selectedAssignment.submissions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                )}
                {selectedAssignment.submissions.map((sub) => {
                  const student = byClass[selectedAssignment.class]?.find((s) => s.id === sub.studentId);
                  const g = grades[sub.studentId] ?? { marks: "", feedback: "" };
                  const late = sub.submittedAt > selectedAssignment.dueDate;
                  return (
                    <div key={sub.studentId} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{student?.name ?? `Student #${sub.studentId}`} <span className="text-muted-foreground font-normal">· Roll {student?.rollNo}</span></p>
                          <p className="text-xs text-muted-foreground">{sub.fileName} · submitted {sub.submittedAt}{late && <span className="text-red-600"> (late)</span>}</p>
                        </div>
                        {sub.marksObtained !== undefined && <Badge variant="secondary">Graded {sub.marksObtained}/{selectedAssignment.totalMarks}</Badge>}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="number" min={0} max={selectedAssignment.totalMarks} placeholder="Marks"
                          value={g.marks} className="sm:w-24"
                          onChange={(e) => setGrades((p) => ({ ...p, [sub.studentId]: { ...g, marks: e.target.value } }))}
                        />
                        <Input
                          placeholder="Feedback (optional)" value={g.feedback} className="flex-1"
                          onChange={(e) => setGrades((p) => ({ ...p, [sub.studentId]: { ...g, feedback: e.target.value } }))}
                        />
                        <Button size="sm" onClick={() => handleSaveGrade(sub.studentId)}>Save</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}