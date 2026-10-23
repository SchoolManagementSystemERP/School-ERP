import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, BookOpen, Clock, IndianRupee, TrendingUp, Users } from "lucide-react";
import { FINE_PER_DAY, librarySummary, useBooks, useLoans, useStudentLookup } from "@/store/library";

export function PrincipalLibrary() {
  const books = useBooks();
  const s = librarySummary(books, useLoans(), useStudentLookup());

  const stats = [
    { label: "Book Copies", value: s.totalCopies.toLocaleString("en-IN"), sub: `${s.titles} titles`, icon: BookOpen, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "Currently Issued", value: s.issued, sub: `${s.borrowers} students borrowing`, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Overdue", value: s.overdue, sub: `₹${s.finesPending} fines pending`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { label: "Fines Collected", value: `₹${s.finesCollected.toLocaleString("en-IN")}`, sub: `₹${FINE_PER_DAY}/day late fee`, icon: IndianRupee, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Library</h1>
        <p className="text-sm text-muted-foreground mt-1">Oversee library books, issues and returns</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st) => (
          <Card key={st.label}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${st.bg} flex items-center justify-center mb-3`}>
                <st.icon className={`h-5 w-5 ${st.color}`} />
              </div>
              <p className={`text-2xl font-bold ${st.color}`}>{st.value}</p>
              <p className="text-xs text-foreground/60 mt-0.5">{st.label}</p>
              <p className="text-xs text-foreground/40 mt-1">{st.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> Overdue Books</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.overdueList.length === 0 && <p className="text-sm text-foreground/60">No overdue books.</p>}
            {s.overdueList.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{o.book}</p>
                  <p className="text-xs text-foreground/60">{o.student} · {o.class} · due {o.dueDate}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="destructive">{o.daysOverdue} days</Badge>
                  <p className="text-xs text-foreground/60 mt-1">₹{o.fine}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-600" /> Stock by Category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {s.categories.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-foreground/60">{c.issued} of {c.total} issued</span>
                </div>
                <Progress value={c.total ? (c.issued / c.total) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /> Most Borrowed</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.popular.map((b, i) => (
              <div key={b.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-foreground/40 w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                    <p className="text-xs text-foreground/60">{b.author}</p>
                  </div>
                </div>
                <Badge variant="secondary">{b.issues} issues</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.book}</p>
                  <p className="text-xs text-foreground/60">{r.student} · {r.class} · issued {r.issueDate}</p>
                </div>
                <Badge className={r.status === "returned" ? "bg-green-600" : "bg-blue-600"}>{r.status === "returned" ? "Returned" : "Issued"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
