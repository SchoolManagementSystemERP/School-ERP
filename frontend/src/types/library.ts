export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  category: string;
  publisher: string;
  edition: string;
  totalCopies: number;
  rack: string;
  publishYear: number;
}

export interface Loan {
  id: number;
  bookId: number;
  studentId: number;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** YYYY-MM-DD, set when returned */
  returnDate?: string;
  /** Fine paid on return (₹) */
  finePaid?: number;
}

export type LoanStatus = "active" | "overdue" | "returned";
