import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User } from "lucide-react";
import { shortClassName } from "@/data/classes";
import { useWeeklyTimetable, type PlannedPeriod } from "@/store/timetable";
import { useCurrentStudent } from "@/store/session";

const SCHOOL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Slot = { time: string; subject: string; teacher: string; room: string };

/** One day's periods as slots, with breaks where periods have a gap. */
function daySlots(periods: PlannedPeriod[], className: string) {
  const slots: Slot[] = [];
  periods.forEach((p, i) => {
    const prevEnd = periods[i - 1]?.timeSlot.split("–")[1];
    const start = p.timeSlot.split("–")[0];
    if (prevEnd && prevEnd !== start) slots.push({ time: `${prevEnd} - ${start}`, subject: "Break", teacher: "", room: "" });
    slots.push({ time: p.timeSlot.replace("–", " - "), subject: p.subjectName, teacher: p.teacherName, room: `Room ${className}` });
  });
  return slots;
}

/** Weekly schedule for a class (Monday = day 1 in the timetable). */
function weeklyTimetable(className: string, weekly: Record<string, Record<number, PlannedPeriod[]>>) {
  const days = weekly[className] ?? {};
  return SCHOOL_DAYS.map((day, i) => ({ day, classes: daySlots(days[i + 1] ?? [], className) }));
}

const getCurrentDay = () => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()];
};

export function StudentTimetable() {
  const currentDay = getCurrentDay();
  const student = useCurrentStudent();
  const weekly = useWeeklyTimetable();
  const timetable = student ? weeklyTimetable(shortClassName(student.class), weekly) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Class Timetable</h1>
          <p className="text-sm text-muted-foreground mt-1">Your weekly academic schedule{student ? ` — ${student.class}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full">
          <Clock className="h-4 w-4" />
          Today: <span className="font-semibold">{currentDay}</span>
        </div>
      </div>

      {/* Today's Highlight */}
      {timetable.find(d => d.day === currentDay) && (
        <Card className="border-blue-500 dark:border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              Today's Schedule — {currentDay}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {timetable.find(d => d.day === currentDay)?.classes.map((cls, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-blue-200 dark:border-blue-800 bg-card"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-lg text-foreground">{cls.subject}</p>
                      <p className="text-sm text-muted-foreground mt-1">{cls.teacher}</p>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {cls.time}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {cls.room}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Timetable */}
      <div className="space-y-6">
        {timetable.map((day) => {
          const isToday = day.day === currentDay;
          return (
            <Card 
              key={day.day} 
              className={`transition-all duration-300 ${isToday ? "border-blue-500 shadow-md" : "hover:shadow-md"}`}
            >
              <CardHeader className={isToday ? "bg-blue-50 dark:bg-blue-950" : ""}>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{day.day}</span>
                  {isToday && <Badge className="bg-blue-600 hover:bg-blue-700">Today</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-3">
                  {day.classes.map((cls, index) => {
                    const isBreak = cls.subject.includes("Break") || cls.subject.includes("Lunch");
                    return (
                      <div
                        key={index}
                        className={`flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl border transition-all hover:shadow-sm ${
                          isBreak 
                            ? "bg-muted border-border" 
                            : "bg-card border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center gap-4 min-w-[140px]">
                          <div className="bg-card px-4 py-2 rounded-lg font-mono text-sm border border-border">
                            {cls.time}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-lg ${isBreak ? "text-muted-foreground italic" : "text-foreground"}`}>
                            {cls.subject}
                          </p>
                          {!isBreak && (
                            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                              <User className="h-4 w-4" />
                              {cls.teacher}
                            </p>
                          )}
                        </div>

                        {!isBreak && (
                          <Badge variant="outline" className="font-mono whitespace-nowrap">
                            {cls.room}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}