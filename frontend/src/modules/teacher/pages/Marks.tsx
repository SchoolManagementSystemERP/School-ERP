import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Upload, Save, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { EXAM_TYPES as examTypes, MAX_MARKS, SUBJECTS } from "@/data/academics";
import { teacherClasses, teacherSubjects, useCurrentTeacher } from "@/store/session";
import { useClassRoster } from "@/store/students";
import { setSubjectMarks, useMarks } from "@/store/marks";

export function Marks() {
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  // Unsaved edits on top of the saved marks for the selected class / exam / subject.
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const maxMarks = String(MAX_MARKS);

  const teacher = useCurrentTeacher();
  const mine = teacherSubjects(teacher).filter((s) => SUBJECTS.includes(s));
  const subjects = mine.length ? mine : SUBJECTS;
  const { classes: allClasses, byClass } = useClassRoster();
  const classes = teacherClasses(teacher, allClasses);
  const savedMarks = useMarks()[selectedClass]?.[selectedExam]?.[selectedSubject] ?? {};
  const students = byClass[selectedClass] ?? [];
  const marks: Record<number, string> = { ...savedMarks, ...draft };

  // Switching class / exam / subject discards unsaved edits.
  const selectAnd = (setter: (v: string) => void) => (v: string) => { setDraft({}); setter(v); };

  const handleMarkChange = (studentId: number, value: string) => {
    setDraft(prev => ({
      ...prev,
      [studentId]: value
    }));
  };

  const handleSaveMarks = () => {
    const changed = Object.keys(draft).length;
    if (!changed) { toast.info("No changes to save."); return; }
    setSubjectMarks(selectedClass, selectedExam, selectedSubject, draft);
    setDraft({});
    toast.success(`Marks saved for ${changed} student${changed > 1 ? "s" : ""}. Principal can see them now.`);
  };

  const handleBulkUpload = () => {
    toast.success("CSV file uploaded successfully!");
    setDialogOpen(false);
  };

  const calculateGrade = (mark: number) => {
    if (mark >= 90) return "A+";
    if (mark >= 80) return "A";
    if (mark >= 70) return "B+";
    if (mark >= 60) return "B";
    if (mark >= 50) return "C";
    return "F";
  };

  const isFormComplete = selectedClass && selectedExam && selectedSubject;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Marks Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload and manage student marks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload CSV
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Marks via CSV</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Upload CSV File</Label>
                <Input type="file" accept=".csv" className="mt-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  CSV format: Roll No, Name, Marks
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button className="flex-1" onClick={handleBulkUpload}>
                  Upload
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Class</label>
              <Select value={selectedClass} onValueChange={selectAnd(setSelectedClass)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Exam Type</label>
              <Select value={selectedExam} onValueChange={selectAnd(setSelectedExam)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {examTypes.map(exam => (
                    <SelectItem key={exam} value={exam}>{exam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Subject</label>
              <Select value={selectedSubject} onValueChange={selectAnd(setSelectedSubject)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map(subject => (
                    <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">Max Marks</label>
              <Input type="number" value={maxMarks} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {isFormComplete && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Enter Marks - {selectedSubject} ({selectedExam})
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" onClick={handleSaveMarks}>
                <Save className="h-4 w-4 mr-2" />
                Save All Marks
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Roll No</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead className="w-32">Marks (/{maxMarks})</TableHead>
                  <TableHead className="w-24">Grade</TableHead>
                  <TableHead className="w-32">Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const mark = parseFloat(marks[student.id] || "0");
                  const percentage = maxMarks ? ((mark / parseFloat(maxMarks)) * 100).toFixed(1) : "0";
                  
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-mono">{student.rollNo}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={maxMarks}
                          value={marks[student.id] || ""}
                          onChange={(e) => handleMarkChange(student.id, e.target.value)}
                          placeholder="0"
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        {marks[student.id] && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            mark >= 60 ? "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300"
                          }`}>
                            {calculateGrade(mark)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {marks[student.id] && `${percentage}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isFormComplete && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Please select class, exam type, and subject to enter marks</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
