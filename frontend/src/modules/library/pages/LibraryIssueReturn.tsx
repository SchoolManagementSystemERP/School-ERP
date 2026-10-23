import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, ArrowUpCircle, ArrowDownCircle, Clock, IndianRupee, Search } from "lucide-react";
import { toast } from "sonner";
import { daysFromToday, today } from "@/lib/dates";
import {
  FINE_PER_DAY, LOAN_DAYS, availableCopies, issueBook, loanFine, loanStatus, returnBook, useBooks, useLoans,
} from "@/store/library";
import { findStudentByLogin } from "@/store/session";
import { useStudents } from "@/store/students";
import type { LoanStatus } from "@/types/library";

export function LibraryIssueReturn() {
  const books = useBooks();
  const loans = useLoans();
  const { students } = useStudents();

  const [searchQuery, setSearchQuery] = useState("");
  const [issueStudentId, setIssueStudentId] = useState("");
  const [issueBookId, setIssueBookId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(daysFromToday(LOAN_DAYS));
  const [returnQuery, setReturnQuery] = useState("");

  const issueStudent = findStudentByLogin(issueStudentId);

  // loans joined with book + student details
  const rows = loans.map((l) => {
    const book = books.find((b) => b.id === l.bookId);
    const student = students.find((s) => s.id === l.studentId);
    return {
      ...l,
      bookTitle: book?.title ?? "Deleted book",
      isbn: book?.isbn ?? "—",
      studentName: student?.name ?? "Former student",
      rollNo: student?.rollNo ?? "—",
      class: student?.class ?? "—",
      status: loanStatus(l),
      fine: loanFine(l),
    };
  });

  const q = searchQuery.toLowerCase();
  const issuedBooks = rows.filter((r) => r.status !== "returned").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const filteredIssuedBooks = issuedBooks.filter((b) =>
    b.bookTitle.toLowerCase().includes(q) || b.studentName.toLowerCase().includes(q) || b.rollNo.toLowerCase().includes(q),
  );
  const activeBooks = filteredIssuedBooks.filter((b) => b.status === "active");
  const overdueBooks = filteredIssuedBooks.filter((b) => b.status === "overdue");
  const returnHistory = rows.filter((r) => r.status === "returned").sort((a, b) => (b.returnDate ?? "").localeCompare(a.returnDate ?? ""));

  // Return tab: match by ISBN, book id, title or student roll number
  const rq = returnQuery.trim().toLowerCase();
  const returnMatches = rq
    ? issuedBooks.filter((r) => r.isbn.toLowerCase() === rq || String(r.bookId) === rq || r.rollNo.toLowerCase() === rq || r.bookTitle.toLowerCase().includes(rq))
    : [];

  const handleIssueBook = () => {
    if (!issueStudent) {
      toast.error("Enter a valid student roll number or admission number");
      return;
    }
    if (!issueBookId) {
      toast.error("Please choose a book");
      return;
    }
    const error = issueBook(Number(issueBookId), issueStudent.id, issueDate, dueDate);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Book issued to ${issueStudent.name}`);
    setIssueStudentId("");
    setIssueBookId("");
  };

  const handleReturnBook = (loanId: number) => {
    const fine = returnBook(loanId);
    toast.success(fine > 0 ? `Book returned! Fine collected: ₹${fine}` : "Book returned successfully!");
    setReturnQuery("");
  };

  const getStatusBadge = (status: LoanStatus) => {
    if (status === "active") {
      return <Badge variant="default" className="bg-blue-600">Active</Badge>;
    } else if (status === "overdue") {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    return <Badge variant="default" className="bg-green-600">Returned</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Issue & Return Books</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage book circulation and returns · Fine ₹{FINE_PER_DAY}/day after the due date</p>
      </div>

      <Tabs defaultValue="issue" className="w-full">
        <TabsList>
          <TabsTrigger value="issue">Issue Book</TabsTrigger>
          <TabsTrigger value="return">Return Book</TabsTrigger>
          <TabsTrigger value="issued">Issued Books ({issuedBooks.length})</TabsTrigger>
          <TabsTrigger value="history">Return History</TabsTrigger>
        </TabsList>

        <TabsContent value="issue" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpCircle className="h-5 w-5" />
                Issue New Book
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Student Roll No. / Admission No.</Label>
                  <Input
                    placeholder="e.g. 017 or ADM-2025-1001"
                    value={issueStudentId}
                    onChange={(e) => setIssueStudentId(e.target.value)}
                  />
                  {issueStudentId && (
                    <p className={`text-xs ${issueStudent ? "text-green-600" : "text-red-600"}`}>
                      {issueStudent ? `${issueStudent.name} · ${issueStudent.class}` : "No student found"}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Book</Label>
                  <Select value={issueBookId} onValueChange={setIssueBookId}>
                    <SelectTrigger><SelectValue placeholder="Choose a book" /></SelectTrigger>
                    <SelectContent>
                      {books.map((b) => {
                        const left = availableCopies(b, loans);
                        return (
                          <SelectItem key={b.id} value={String(b.id)} disabled={left === 0}>
                            {b.title} — {left} available
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleIssueBook} className="w-full gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Issue Book
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5" />
                Return Book
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Book ISBN, book ID, title or student roll no.</Label>
                <Input
                  placeholder="Scan or enter ISBN / roll number"
                  value={returnQuery}
                  onChange={(e) => setReturnQuery(e.target.value)}
                />
              </div>
              {rq && returnMatches.length === 0 && (
                <p className="text-sm text-foreground/60">No issued book matches “{returnQuery}”.</p>
              )}
              {returnMatches.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{r.bookTitle}</p>
                    <p className="text-sm text-foreground/60">{r.studentName} · Roll {r.rollNo} · due {r.dueDate}</p>
                  </div>
                  <Button onClick={() => handleReturnBook(r.id)} variant={r.fine ? "destructive" : "default"} className="gap-2">
                    <ArrowDownCircle className="h-4 w-4" />
                    Return {r.fine ? `(Fine ₹${r.fine})` : ""}
                  </Button>
                </div>
              ))}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  Overdue books are fined ₹{FINE_PER_DAY} per day; the fine is calculated automatically on return.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issued" className="mt-6">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                type="text"
                placeholder="Search by book title, student name, or roll number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground/60">Active Issues</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{activeBooks.length}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                      <BookOpen className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground/60">Overdue Books</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{overdueBooks.length}</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg">
                      <Clock className="h-6 w-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              {filteredIssuedBooks.map((book) => (
                <Card key={book.id} className={book.status === "overdue" ? "border-orange-300 dark:border-orange-500/30" : ""}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-lg">{book.bookTitle}</h3>
                        <p className="text-sm text-foreground/60 mt-1">ISBN: {book.isbn}</p>
                      </div>
                      {getStatusBadge(book.status)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-foreground/60">Student</p>
                        <p className="font-medium text-foreground">{book.studentName}</p>
                        <p className="text-xs text-foreground/60">Roll {book.rollNo} • {book.class}</p>
                      </div>
                      <div>
                        <p className="text-foreground/60">Issue Date</p>
                        <p className="font-medium text-foreground">{book.issueDate}</p>
                      </div>
                      <div>
                        <p className="text-foreground/60">Due Date</p>
                        <p className={`font-medium ${book.status === "overdue" ? "text-red-600" : "text-foreground"}`}>
                          {book.dueDate}
                        </p>
                      </div>
                      <div>
                        {book.status === "overdue" && (
                          <>
                            <p className="text-foreground/60">Fine</p>
                            <p className="font-semibold text-red-600 flex items-center gap-1">
                              <IndianRupee className="h-4 w-4" />
                              {book.fine}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border">
                      <Button
                        onClick={() => handleReturnBook(book.id)}
                        size="sm"
                        variant={book.status === "overdue" ? "destructive" : "default"}
                        className="gap-2"
                      >
                        <ArrowDownCircle className="h-4 w-4" />
                        Return Book {book.fine ? `(Fine: ₹${book.fine})` : ""}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredIssuedBooks.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <BookOpen className="h-12 w-12 text-foreground/30 mx-auto mb-4" />
                  <p className="text-foreground/60">No issued books found</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="space-y-3">
            {returnHistory.length === 0 && <p className="text-sm text-foreground/50">No returns yet.</p>}
            {returnHistory.map((record) => (
              <Card key={record.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg">{record.bookTitle}</h3>
                      <p className="text-sm text-foreground/60 mt-1">ISBN: {record.isbn}</p>
                    </div>
                    {getStatusBadge(record.status)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-foreground/60">Student</p>
                      <p className="font-medium text-foreground">{record.studentName}</p>
                      <p className="text-xs text-foreground/60">Roll {record.rollNo} • {record.class}</p>
                    </div>
                    <div>
                      <p className="text-foreground/60">Issue Date</p>
                      <p className="font-medium text-foreground">{record.issueDate}</p>
                    </div>
                    <div>
                      <p className="text-foreground/60">Return Date</p>
                      <p className="font-medium text-green-600">{record.returnDate}</p>
                    </div>
                    <div>
                      <p className="text-foreground/60">Fine Paid</p>
                      <p className="font-medium text-foreground">₹{record.fine}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
