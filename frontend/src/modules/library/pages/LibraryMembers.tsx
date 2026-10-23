import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { loanFine, loanStatus, useBooks, useLoans } from "@/store/library";
import { useClassRoster, useStudents } from "@/store/students";

/** Every student is a library member; shows their borrowing and fines. */
export function LibraryMembers() {
  const { students } = useStudents();
  const { classes } = useClassRoster();
  const books = useBooks();
  const loans = useLoans();
  const [search, setSearch] = useState("");
  const [cls, setCls] = useState("all");
  const [filter, setFilter] = useState("all");

  const rows = students.map((s) => {
    const mine = loans.filter((l) => l.studentId === s.id);
    const out = mine.filter((l) => !l.returnDate);
    const overdue = out.filter((l) => loanStatus(l) === "overdue");
    return {
      ...s,
      borrowed: mine.length,
      out,
      overdue: overdue.length,
      fineDue: overdue.reduce((a, l) => a + loanFine(l), 0),
      finePaid: mine.reduce((a, l) => a + (l.finePaid ?? 0), 0),
    };
  });

  const q = search.toLowerCase();
  const shown = rows
    .filter((r) => (!q || r.name.toLowerCase().includes(q) || r.rollNo.includes(q)) && (cls === "all" || r.class === cls))
    .filter((r) => filter === "all" || (filter === "borrowing" && r.out.length) || (filter === "overdue" && r.overdue))
    .sort((a, b) => b.overdue - a.overdue || b.out.length - a.out.length || a.rollNo.localeCompare(b.rollNo));

  const title = (id: number) => books.find((b) => b.id === id)?.title ?? "Deleted book";

  return (
    <div className="space-y-6">
      <PageHeader title="Members" description="Every student is a library member — books out, overdue items and fines" />

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or roll number..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All members</SelectItem>
              <SelectItem value="borrowing">Currently borrowing</SelectItem>
              <SelectItem value="overdue">With overdue books</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {shown.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No members found.</p>}
          {shown.map((r) => (
            <div key={r.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-4">
              <div className="flex items-center gap-3 lg:w-64 shrink-0">
                <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold">{r.initials}</div>
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.class} · Roll {r.rollNo}</p>
                </div>
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {r.out.length === 0 && <span className="text-xs text-muted-foreground">No books out</span>}
                {r.out.map((l) => (
                  <Badge key={l.id} variant={loanStatus(l) === "overdue" ? "destructive" : "secondary"} className="gap-1">
                    <BookOpen className="h-3 w-3" /> {title(l.bookId)} · due {l.dueDate}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-6 text-xs shrink-0">
                <div><p className="text-muted-foreground">Borrowed</p><p className="font-semibold text-foreground">{r.borrowed}</p></div>
                <div><p className="text-muted-foreground">Fine due</p><p className={r.fineDue ? "font-semibold text-red-600" : "font-semibold text-foreground"}>₹{r.fineDue}</p></div>
                <div><p className="text-muted-foreground">Fine paid</p><p className="font-semibold text-foreground">₹{r.finePaid}</p></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
