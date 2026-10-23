import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  IndianRupee,
  ArrowRight,
  Book,
  FileText,
} from "lucide-react";
import { librarySummary, useBooks, useLoans, useStudentLookup } from "@/store/library";
import { StatCard, toneFrom } from "@/components/common/StatCard";

export function LibraryDashboard() {
  const summary = librarySummary(useBooks(), useLoans(), useStudentLookup());

  const stats = [
    { title: "Total Books", value: summary.totalCopies.toLocaleString("en-IN"), icon: BookOpen, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950" },
    { title: "Books Issued", value: String(summary.issued), icon: Users, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950" },
    { title: "Overdue Books", value: String(summary.overdue), icon: Clock, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950" },
    { title: "Fines Collected", value: `₹${summary.finesCollected.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950" },
  ];

  const categoryStats = summary.categories;
  const recentIssues = summary.recent;
  const overdueBooks = summary.overdueList;
  const popularBooks = summary.popular;

  const getStatusBadge = (status: string) => {
    if (status === "issued") {
      return <Badge variant="default" className="bg-blue-600">Issued</Badge>;
    }
    return <Badge variant="default" className="bg-green-600">Returned</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Library Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of library operations and book circulation</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/librarian/books">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                  <Book className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Books Catalog</p>
                  <p className="text-sm text-muted-foreground">Manage book collection</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground ml-auto" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/librarian/issue-return">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Issue & Return</p>
                  <p className="text-sm text-muted-foreground">Manage circulation</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground ml-auto" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Member Cards</p>
                <p className="text-sm text-muted-foreground">Manage memberships</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground ml-auto" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} label={stat.title} value={stat.value} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Books by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryStats.map((category, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{category.name}</span>
                    <span className="text-sm text-muted-foreground">{category.total} books</span>
                  </div>
                  <Progress
                    value={(category.available / category.total) * 100}
                    className="h-2 mb-1"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Available: {category.available}</span>
                    <span>Issued: {category.issued}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Popular Books */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Most Popular Books
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {popularBooks.map((book, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div>
                    <p className="font-medium text-foreground">{book.title}</p>
                    <p className="text-sm text-muted-foreground">{book.author}</p>
                  </div>
                  <Badge variant="secondary">{book.issues} issues</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Recent Book Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentIssues.map((issue, index) => (
                <div
                  key={index}
                  className="p-3 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-foreground">{issue.book}</p>
                      <p className="text-sm text-muted-foreground">
                        {issue.student} ({issue.class})
                      </p>
                    </div>
                    {getStatusBadge(issue.status)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Issued: {issue.issueDate}</span>
                    <span>Due: {issue.dueDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Overdue Books */}
        <Card className="border-orange-200 dark:border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-300">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Overdue Books
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueBooks.length === 0 && <p className="text-sm text-muted-foreground">No overdue books.</p>}
              {overdueBooks.map((book, index) => (
                <div
                  key={index}
                  className="p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-foreground">{book.book}</p>
                      <p className="text-sm text-muted-foreground">
                        {book.student} ({book.class})
                      </p>
                    </div>
                    <Badge variant="destructive">{book.daysOverdue} days</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-900 dark:text-orange-300">Due: {book.dueDate}</span>
                    <span className="font-semibold text-orange-900 dark:text-orange-300">Fine: ₹{book.fine}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
