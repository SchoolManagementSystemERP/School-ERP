/**
 * Library, from the API (GET /library): books and this year's loans. The librarian issues and takes
 * back books (fines are worked out by the server: days late × fine per day).
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { daysUntil, today } from "@/lib/dates";
import type { Book, Loan, LoanStatus } from "@/types/library";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteCollection, remoteStore, tempId } from "./remote";
import { studentStore } from "./students";

/** Fine per day for late returns (₹) — from the school's library settings. */
export let FINE_PER_DAY = 5;
/** Default loan period in days. */
export let LOAN_DAYS = 14;

interface ApiBook { id: string; title: string; author: string; isbn: string | null; category: string; publisher: string | null; edition: string | null; publishYear: number | null; totalCopies: number; rack: string | null }
interface ApiLoan { id: string; bookId: string; studentId: string | null; issueDate: string; dueDate: string; returnDate: string | null; finePaid: number }
interface ApiLibrary { finePerDay: number; loanDays: number; books: ApiBook[]; loans: ApiLoan[] }

const toBook = (b: ApiBook): Book => ({
  id: numId("book", b.id), title: b.title, author: b.author, isbn: b.isbn ?? "", category: b.category, publisher: b.publisher ?? "",
  edition: b.edition ?? "", publishYear: b.publishYear ?? 0, totalCopies: b.totalCopies, rack: b.rack ?? "",
});
const toLoan = (l: ApiLoan): Loan => ({
  id: numId("loan", l.id), bookId: numId("book", l.bookId), studentId: l.studentId ? numId("student", l.studentId) : 0, issueDate: l.issueDate, dueDate: l.dueDate,
  ...(l.returnDate ? { returnDate: l.returnDate, finePaid: l.finePaid } : {}),
});
const bookApi = (b: Omit<Book, "id">) => ({
  title: b.title, author: b.author, isbn: b.isbn || null, category: b.category, publisher: b.publisher || null, edition: b.edition || null,
  publishYear: b.publishYear || null, totalCopies: Number(b.totalCopies), rack: b.rack || null,
});

let libraryRequest: Promise<ApiLibrary | null> | null = null;
function fetchLibrary() {
  libraryRequest ??= (canAny("library.manage", "reports.view") ? ifAllowed(api.get<ApiLibrary>("/library"), null) : Promise.resolve(null))
    .finally(() => setTimeout(() => { libraryRequest = null; }, 0));
  return libraryRequest;
}

const bookBase = remoteCollection<Book>("books", async () => {
  const lib = await fetchLibrary();
  if (lib) { FINE_PER_DAY = lib.finePerDay; LOAN_DAYS = lib.loanDays; }
  return (lib?.books ?? []).map(toBook);
});
export const loanStore = remoteStore<Loan[]>("loans", [], async () => ((await fetchLibrary())?.loans ?? []).filter((l) => l.studentId).map(toLoan));

export const bookStore = Object.assign(bookBase, {
  add(record: Omit<Book, "id">): Book {
    const id = tempId();
    const created = { ...record, id };
    void mutate(bookBase, (l) => [...l, created], async () => {
      const saved = await api.post<ApiBook>("/library/books", bookApi(record));
      bookBase.set((l) => l.map((x) => (x.id === id ? toBook(saved) : x)));
    });
    return created;
  },
  update(record: Book) {
    void mutate(bookBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () => api.patch(`/library/books/${guidOf("book", record.id)}`, bookApi(record)));
  },
  remove(id: number) {
    void mutate(bookBase, (l) => l.filter((x) => x.id !== id), () => api.del(`/library/books/${guidOf("book", id)}`));
  },
});

export const useBooks = () => bookBase.useItems();
export const useLoans = () => loanStore.useValue();

export function loanStatus(loan: Loan): LoanStatus {
  if (loan.returnDate) return "returned";
  return daysUntil(loan.dueDate) < 0 ? "overdue" : "active";
}

/** Fine owed right now for an unreturned loan (or the fine paid, once returned). */
export function loanFine(loan: Loan): number {
  if (loan.returnDate) return loan.finePaid ?? 0;
  return Math.max(0, -daysUntil(loan.dueDate)) * FINE_PER_DAY;
}

export function copiesOut(bookId: number, loans: Loan[]) {
  return loans.filter((l) => l.bookId === bookId && !l.returnDate).length;
}

export function availableCopies(book: Book, loans: Loan[]) {
  return Math.max(0, book.totalCopies - copiesOut(book.id, loans));
}

/** Issues a book. Returns an error message if it cannot be issued. */
export function issueBook(bookId: number, studentId: number, issueDate: string, dueDate: string): string | null {
  const book = bookStore.getAll().find((b) => b.id === bookId);
  const loans = loanStore.get();
  if (!book) return "Book not found";
  if (availableCopies(book, loans) === 0) return `No copies of "${book.title}" are available`;
  if (loans.some((l) => l.bookId === bookId && l.studentId === studentId && !l.returnDate)) return "This student already has this book";
  if (dueDate < issueDate) return "Due date must be after the issue date";
  const id = tempId();
  void mutate(loanStore, (list) => [...list, { id, bookId, studentId, issueDate, dueDate }], async () => {
    const saved = await api.post<ApiLoan>("/library/loans", { bookId: guidOf("book", bookId), studentId: guidOf("student", studentId), issueDate, dueDate });
    loanStore.set((list) => list.map((l) => (l.id === id ? toLoan(saved) : l)));
  });
  return null;
}

/** Returns a book and records the fine. Returns the fine charged. */
export function returnBook(loanId: number): number {
  const loan = loanStore.get().find((l) => l.id === loanId);
  if (!loan || loan.returnDate) return 0;
  const fine = loanFine(loan);
  void mutate(loanStore, (list) => list.map((l) => (l.id === loanId ? { ...l, returnDate: today(), finePaid: fine } : l)), () => api.post(`/library/loans/${guidOf("loan", loanId)}/return`, {}));
  return fine;
}

/** Removes a book unless copies are still out. Returns an error message if blocked. */
export function removeBook(bookId: number): string | null {
  if (copiesOut(bookId, loanStore.get()) > 0) return "Return all issued copies before deleting this book";
  bookStore.remove(bookId);
  return null;
}

/** Library-wide figures shared by the librarian dashboard and the principal's library page. */
export function librarySummary(books: Book[], loans: Loan[], studentName: (id: number) => { name: string; class: string }) {
  const out = loans.filter((l) => !l.returnDate);
  const overdue = out.filter((l) => loanStatus(l) === "overdue");
  const bookOf = (id: number) => books.find((b) => b.id === id);

  const categories = [...new Set(books.map((b) => b.category))].map((name) => {
    const inCat = books.filter((b) => b.category === name);
    const total = inCat.reduce((a, b) => a + b.totalCopies, 0);
    const issued = inCat.reduce((a, b) => a + copiesOut(b.id, loans), 0);
    return { name, total, issued, available: total - issued };
  }).sort((a, b) => b.total - a.total);

  const popular = books
    .map((b) => ({ id: b.id, title: b.title, author: b.author, issues: loans.filter((l) => l.bookId === b.id).length }))
    .filter((b) => b.issues > 0)
    .sort((a, b) => b.issues - a.issues)
    .slice(0, 5);

  const recent = [...loans].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.id - a.id).slice(0, 5).map((l) => ({
    id: l.id,
    book: bookOf(l.bookId)?.title ?? "Deleted book",
    student: studentName(l.studentId).name,
    class: studentName(l.studentId).class,
    issueDate: l.issueDate,
    dueDate: l.dueDate,
    status: l.returnDate ? "returned" : "issued",
  }));

  const overdueList = overdue.map((l) => ({
    id: l.id,
    book: bookOf(l.bookId)?.title ?? "Deleted book",
    student: studentName(l.studentId).name,
    class: studentName(l.studentId).class,
    dueDate: l.dueDate,
    daysOverdue: -daysUntil(l.dueDate),
    fine: loanFine(l),
  })).sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    totalCopies: books.reduce((a, b) => a + b.totalCopies, 0),
    titles: books.length,
    issued: out.length,
    overdue: overdue.length,
    finesCollected: loans.reduce((a, l) => a + (l.finePaid ?? 0), 0),
    finesPending: overdue.reduce((a, l) => a + loanFine(l), 0),
    borrowers: new Set(out.map((l) => l.studentId)).size,
    categories,
    popular,
    recent,
    overdueList,
  };
}

/** Student name/class lookup for library lists. */
export function useStudentLookup() {
  const students = studentStore.useItems();
  return (id: number) => {
    const s = students.find((x) => x.id === id);
    return { name: s?.name ?? "Former student", class: s?.class ?? "—" };
  };
}
