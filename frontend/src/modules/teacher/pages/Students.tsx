import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Eye, Mail, Phone } from "lucide-react";
import type { Student } from "@/types/student";
import { useClassRoster, useStudents } from "@/store/students";



export function Students() {
  const { students } = useStudents();
  const classes = ["All Classes", ...useClassRoster().classes];
  const [selectedClass, setSelectedClass] = useState<string>("All Classes");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredStudents = students.filter(student => {
    const classMatch = selectedClass === "All Classes" || student.class === selectedClass;
    const searchMatch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       student.rollNo.includes(searchQuery);
    return classMatch && searchMatch;
  });

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student);
    setDialogOpen(true);
  };

  const getPerformanceColor = (performance: string) => {
    switch (performance) {
      case "Excellent": return "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300";
      case "Good": return "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300";
      case "Average": return "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-300";
      case "Poor": return "bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300";
      default: return "bg-muted text-foreground";
    }
  };

  const getAttendanceColor = (attendance: number) => {
    if (attendance >= 90) return "text-green-600";
    if (attendance >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Students</h1>
        <p className="text-sm text-muted-foreground mt-1">View and manage student information</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Students</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{students.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Excellent Performers</p>
            <p className="text-2xl font-semibold text-green-600 mt-1">
              {students.filter(s => s.performance === "Excellent").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg. Attendance</p>
            <p className="text-2xl font-semibold text-blue-600 mt-1">
              {Math.round(students.reduce((acc, s) => acc + s.attendance, 0) / students.length)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Need Attention</p>
            <p className="text-2xl font-semibold text-orange-600 mt-1">
              {students.filter(s => s.attendance < 85 || s.performance === "Poor").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or roll number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map(cls => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Students List */}
      <Card>
        <CardHeader>
          <CardTitle>Student List ({filteredStudents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredStudents.map((student) => (
              <div 
                key={student.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Avatar>
                    <AvatarFallback>{student.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold text-foreground">{student.name}</h4>
                      <Badge variant="outline" className="font-mono text-xs">
                        {student.rollNo}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{student.class}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Attendance</p>
                    <p className={`text-sm font-semibold ${getAttendanceColor(student.attendance)}`}>
                      {student.attendance}%
                    </p>
                  </div>
                  <div>
                    <Badge className={getPerformanceColor(student.performance)}>
                      {student.performance}
                    </Badge>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewDetails(student)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </div>
              </div>
            ))}

            {filteredStudents.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No students found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Student Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Student Details</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-xl">{selectedStudent.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-semibold">{selectedStudent.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedStudent.class} • Roll No: {selectedStudent.rollNo}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedStudent.email}</span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedStudent.phone}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Attendance Rate</p>
                  <p className={`text-2xl font-semibold mt-1 ${getAttendanceColor(selectedStudent.attendance)}`}>
                    {selectedStudent.attendance}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Performance</p>
                  <Badge className={`${getPerformanceColor(selectedStudent.performance)} mt-2`}>
                    {selectedStudent.performance}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button className="w-full" variant="outline">
                  View Full Academic Record
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
