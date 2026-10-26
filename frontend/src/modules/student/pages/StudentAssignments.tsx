import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Calendar,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { studentAssignmentStatus, submitAssignment, useAssignments } from "@/store/assignments";
import { MiniStats } from "@/components/common/MiniStats";
import { useCurrentStudent } from "@/store/session";

export function StudentAssignments() {
  const student = useCurrentStudent();
  const all = useAssignments();
  const [searchQuery, setSearchQuery] = useState("");
  // file picked per assignment card
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File>>({});

  const assignments = all
    .filter((a) => student && a.class === student.class)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((a) => {
      const sub = student ? a.submissions.find((s) => s.studentId === student.id) : undefined;
      const status = student ? studentAssignmentStatus(a, student.id) : "pending";
      return {
        id: a.id,
        title: a.title,
        subject: a.subject,
        description: a.description,
        dueDate: a.dueDate,
        assignedDate: a.assignedDate,
        maxMarks: a.totalMarks,
        // graded work shows as submitted, with marks and feedback
        status: status === "graded" ? "submitted" : status,
        submittedDate: sub?.submittedAt,
        fileName: sub?.fileName,
        marksObtained: sub?.marksObtained,
        feedback: sub?.feedback,
        teacher: a.teacher,
      };
    });

  const filteredAssignments = assignments.filter((assignment) =>
    assignment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assignment.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingAssignments = filteredAssignments.filter((a) => a.status === "pending");
  const submittedAssignments = filteredAssignments.filter((a) => a.status === "submitted");
  const overdueAssignments = filteredAssignments.filter((a) => a.status === "overdue");

  const handleFileSelect = (assignmentId: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFiles((p) => ({ ...p, [assignmentId]: file }));
  };

  const handleSubmit = (assignmentId: number) => {
    const file = selectedFiles[assignmentId];
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }
    if (!student) return;
    submitAssignment(assignmentId, student.id, file.name);
    toast.success("Assignment submitted! Your teacher can see it now.");
    setSelectedFiles((p) => { const next = { ...p }; delete next[assignmentId]; return next; });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "submitted":
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Submitted</Badge>;
      case "overdue":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Overdue</Badge>;
      default:
        return null;
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const AssignmentCard = ({ assignment }: { assignment: typeof assignments[0] }) => {
    const daysRemaining = getDaysRemaining(assignment.dueDate);

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{assignment.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{assignment.subject}</p>
            </div>
            {getStatusBadge(assignment.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground/80">{assignment.description}</p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Teacher</p>
              <p className="font-medium text-foreground">{assignment.teacher}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Marks</p>
              <p className="font-medium text-foreground">{assignment.maxMarks}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assigned Date</p>
              <p className="font-medium text-foreground">{assignment.assignedDate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Due Date</p>
              <p className={`font-medium ${daysRemaining < 3 && assignment.status === 'pending' ? 'text-red-600' : 'text-foreground'}`}>
                {assignment.dueDate}
              </p>
            </div>
          </div>

          {assignment.status === "pending" && (
            <div className="pt-4 border-t border-border">
              {daysRemaining >= 0 && (
                <p className="text-sm mb-3">
                  {daysRemaining === 0 ? (
                    <span className="text-red-600 font-medium">Due today!</span>
                  ) : daysRemaining === 1 ? (
                    <span className="text-orange-600 font-medium">Due tomorrow</span>
                  ) : (
                    <span className="text-muted-foreground">{daysRemaining} days remaining</span>
                  )}
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="file"
                  onChange={handleFileSelect(assignment.id)}
                  className="flex-1"
                />
                <Button onClick={() => handleSubmit(assignment.id)} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Submit
                </Button>
              </div>
            </div>
          )}

          {assignment.status === "submitted" && (
            <div className="pt-4 border-t border-border space-y-2">
              <p className="text-sm text-green-600 font-medium">
                ✓ Submitted on {assignment.submittedDate}{assignment.fileName ? ` · ${assignment.fileName}` : ""}
              </p>
              {assignment.marksObtained !== undefined && (
                <>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Marks Obtained: </span>
                    <span className="font-semibold text-foreground">
                      {assignment.marksObtained}/{assignment.maxMarks}
                    </span>
                  </p>
                  {assignment.feedback && (
                    <div className="bg-blue-50 dark:bg-blue-500/10 p-3 rounded-lg">
                      <p className="text-xs font-medium text-blue-900 dark:text-blue-300">Teacher's Feedback:</p>
                      <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">{assignment.feedback}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {assignment.status === "overdue" && (
            <div className="pt-4 border-t border-border">
              <div className="bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                  This assignment is overdue. Please submit as soon as possible.
                </p>
              </div>
              <div className="flex gap-2 mt-3">
                <Input
                  type="file"
                  onChange={handleFileSelect(assignment.id)}
                  className="flex-1"
                />
                <Button onClick={() => handleSubmit(assignment.id)} variant="destructive" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Submit Late
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Assignments</h1>
        <p className="text-sm text-muted-foreground mt-1">View and submit your assignments</p>
      </div>

      {/* Stats */}
      <MiniStats items={[
        { label: "To submit", value: pendingAssignments.length, icon: Clock, tone: "amber" },
        { label: "Overdue", value: overdueAssignments.length, icon: AlertCircle, tone: overdueAssignments.length ? "red" : "slate" },
        { label: "Submitted", value: submittedAssignments.length, icon: CheckCircle2, tone: "green" },
      ]} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search assignments by title or subject..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Assignments Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All ({filteredAssignments.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingAssignments.length})</TabsTrigger>
          <TabsTrigger value="submitted">Submitted ({submittedAssignments.length})</TabsTrigger>
          {overdueAssignments.length > 0 && (
            <TabsTrigger value="overdue">Overdue ({overdueAssignments.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all" className="mt-6 space-y-4">
          {filteredAssignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments for your class yet.</p>}
          {filteredAssignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-6 space-y-4">
          {pendingAssignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </TabsContent>

        <TabsContent value="submitted" className="mt-6 space-y-4">
          {submittedAssignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </TabsContent>

        <TabsContent value="overdue" className="mt-6 space-y-4">
          {overdueAssignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
