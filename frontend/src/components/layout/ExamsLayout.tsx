import { Award, BarChart3, CalendarDays } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Exam Schedule", href: "/exams", icon: CalendarDays },
      { name: "Admit Cards", href: "/exams/admit-cards", icon: Award },
      { name: "Results", href: "/exams/results", icon: BarChart3 },
    ],
  },
];

export function ExamsLayout() {
  return <AppShell portal="Examinations" home="/exams" nav={nav} user={{ name: "Mr. Mahesh Gupta", subtitle: "Exam Controller", initials: "MG" }} />;
}
