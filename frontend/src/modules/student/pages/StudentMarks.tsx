import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { FileText, Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { EXAM_TYPES, MAX_MARKS } from "@/data/academics";
import { examHistory, examResult, rankInClass } from "@/lib/studentStats";
import { usePublishedExamNames } from "@/store/exams";
import { useMarks } from "@/store/marks";
import { useCurrentStudent } from "@/store/session";
import { useClassRoster } from "@/store/students";

export function StudentMarks() {
  const student = useCurrentStudent();
  const marks = useMarks();
  const { byClass } = useClassRoster();
  // only results the exam controller has published
  const published = usePublishedExamNames();
  const history = student ? examHistory(marks, student.class, student.id).filter((r) => published.has(r.exam)) : [];
  const [selectedExam, setSelectedExam] = useState(history.at(-1)?.exam ?? EXAM_TYPES[0]);
  if (!student) return null;

  const examTypes = EXAM_TYPES.filter((exam) => published.has(exam)).map((exam) => ({ value: exam, label: exam }));
  const classmates = (byClass[student.class] ?? []).map((s) => s.id);
  const result = examResult(marks, student.class, selectedExam, student.id);
  const prevExam = EXAM_TYPES[EXAM_TYPES.indexOf(selectedExam) - 1];
  const prevResult = prevExam ? examResult(marks, student.class, prevExam, student.id) : null;

  const subjectMarks = (result?.subjects ?? []).map((sub) => {
    const before = prevResult?.subjects.find((p) => p.subject === sub.subject)?.marks;
    return {
      subject: sub.subject,
      theory: sub.marks,
      practical: null as number | null,
      total: sub.marks,
      maxMarks: MAX_MARKS,
      grade: sub.grade,
      percentage: Math.round(sub.percentage * 10) / 10,
      rank: rankInClass(marks, student.class, selectedExam, classmates, student.id, sub.subject)?.rank ?? "—",
      trend: before === undefined ? "same" : sub.marks > before ? "up" : sub.marks < before ? "down" : "same",
    };
  });

  const overallRank = rankInClass(marks, student.class, selectedExam, classmates, student.id);
  const overallStats = {
    totalMarks: result?.maxTotal ?? 0,
    obtainedMarks: result?.total ?? 0,
    percentage: result ? Math.round(result.percentage * 10) / 10 : 0,
    grade: result?.grade ?? "—",
    classRank: overallRank?.rank ?? "—",
    totalStudents: overallRank?.outOf ?? classmates.length,
  };

  const examHistoryRows = history.map((r) => ({ exam: r.exam, percentage: Math.round(r.percentage * 10) / 10, grade: r.grade }));

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-500";
    if (percentage >= 80) return "bg-blue-500";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  const handleDownloadReport = () => {
    toast.success("Report Card downloaded successfully!");
    // In real app, this would generate PDF
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
            Marks & Results
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Academic Performance Overview
          </p>
        </div>
        <Button onClick={handleDownloadReport} className="gap-2 w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Download Report Card
        </Button>
      </div>

      {/* Exam Selector */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-sm font-medium text-foreground/80 min-w-fit">
              Select Exam Period:
            </label>
            <Select value={selectedExam} onValueChange={setSelectedExam}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {examTypes.map((exam) => (
                  <SelectItem key={exam.value} value={exam.value}>
                    {exam.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Obtained Marks</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {overallStats.obtainedMarks}<span className="text-xl text-muted-foreground">/{overallStats.totalMarks}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Overall Percentage</p>
            <p className="text-3xl font-bold text-foreground mt-1">{overallStats.percentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Grade</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{overallStats.grade}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Class Rank</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {overallStats.classRank}<span className="text-xl text-muted-foreground">/{overallStats.totalStudents}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="detailed" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="detailed">Subject-wise Marks</TabsTrigger>
          <TabsTrigger value="history">Exam History</TabsTrigger>
        </TabsList>

        {/* Detailed Marks Tab */}
        <TabsContent value="detailed" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Subject-wise Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {subjectMarks.length === 0 && (
                <p className="text-sm text-muted-foreground">Marks for {selectedExam} have not been entered yet.</p>
              )}
              {subjectMarks.map((subject, index) => (
                <div key={index} className="border-b border-border last:border-0 pb-8 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-xl text-foreground">
                        {subject.subject}
                      </h3>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant={subject.grade === "A+" ? "default" : "secondary"} className="text-sm">
                          {subject.grade}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Rank #{subject.rank}
                        </span>
                        {getTrendIcon(subject.trend)}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-3xl font-bold text-foreground">
                        {subject.total}<span className="text-xl text-muted-foreground">/{subject.maxMarks}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{subject.percentage}%</p>
                    </div>
                  </div>

                  <Progress 
                    value={subject.percentage} 
                    className={`h-2.5 ${getProgressColor(subject.percentage)}`} 
                  />

                  {subject.practical !== null && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                    <div className="bg-muted/50 p-4 rounded-xl">
                      <p className="text-sm text-muted-foreground">Theory</p>
                      <p className="font-semibold text-lg mt-1">{subject.theory}/100</p>
                    </div>
                    {(
                      <div className="bg-muted/50 p-4 rounded-xl">
                        <p className="text-sm text-muted-foreground">Practical</p>
                        <p className="font-semibold text-lg mt-1">{subject.practical}/100</p>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exam History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Previous Exam Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {examHistoryRows.length === 0 && <p className="text-sm text-muted-foreground">No exam results yet.</p>}
                {examHistoryRows.map((exam, index) => (
                  <div key={index} className="flex items-center justify-between p-5 border border-border rounded-xl">
                    <div>
                      <p className="font-medium text-foreground">{exam.exam}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="default" className="mb-1">{exam.grade}</Badge>
                      <p className="font-semibold text-lg">{exam.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}