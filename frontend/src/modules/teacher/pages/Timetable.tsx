import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SCHOOL_DAYS, teacherPeriods } from "@/lib/schedule";
import { teacherSubjects, useCurrentTeacher } from "@/store/session";

const getCurrentDay = () => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()];
};

export function Timetable() {
  const today = getCurrentDay();
  const [filterSubject, setFilterSubject] = useState<string>("All");
  const teacher = useCurrentTeacher();
  const periods = teacherPeriods(teacher?.name);
  const mySubjects = [...new Set([...periods.map((p) => p.subject), ...teacherSubjects(teacher)])];
  const timetable = SCHOOL_DAYS.map((day) => ({ day, classes: periods }));

  const filteredTimetable = timetable.map(day => ({
    ...day,
    classes: filterSubject === "All" 
      ? day.classes 
      : day.classes.filter(cls => cls.subject === filterSubject)
  })).filter(day => day.classes.length > 0);

  const totalClasses = timetable.reduce((acc, day) => acc + day.classes.length, 0);
  const todayClasses = timetable.find(d => d.day === today)?.classes.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
            My Timetable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {teacher?.name} • {mySubjects.join(", ") || "No subjects assigned"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by Subject:</span>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Subjects</SelectItem>
              {mySubjects.map(subject => (
                <SelectItem key={subject} value={subject}>{subject}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Classes / Week</p>
            <p className="text-3xl font-semibold text-foreground mt-1">{totalClasses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Classes Today</p>
            <p className="text-3xl font-semibold text-blue-600 mt-1">{todayClasses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Subjects Taught</p>
            <p className="text-3xl font-semibold text-foreground mt-1">{mySubjects.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Schedule */}
      {(timetable.find(d => d.day === today)?.classes.length ?? 0) > 0 && (
        <Card className="border-blue-500 border-2 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Today's Schedule — <span className="text-blue-600">{today}</span>
              <Badge className="bg-blue-500">Today</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {timetable.find(d => d.day === today)?.classes.map((cls, i) => (
                <div key={i} className="p-5 bg-card rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{cls.class}</h4>
                      <p className="text-blue-600 dark:text-blue-400 font-medium">{cls.subject}</p>
                    </div>
                    <Badge variant="outline">{cls.time}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" /> {cls.room}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Weekly Timetable */}
      <div className="space-y-5">
        {filteredTimetable.map((daySchedule) => (
          <Card key={daySchedule.day} className={daySchedule.day === today ? "border-blue-500" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{daySchedule.day}</span>
                {daySchedule.day === today && <Badge className="bg-blue-500">Today</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {daySchedule.classes.map((classItem, index) => (
                  <div 
                    key={index}
                    className="p-5 border border-border rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-lg">{classItem.class}</h4>
                        <p className="text-primary font-medium mt-1">{classItem.subject}</p>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {classItem.time}
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {classItem.time}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {classItem.room}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}