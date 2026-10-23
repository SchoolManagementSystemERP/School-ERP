export interface FeePayment {
  id: number;
  studentId: number;
  /** 1-based installment number */
  installment: number;
  amount: number;
  lateFee: number;
  method: string;
  txnId: string;
  /** YYYY-MM-DD */
  date: string;
}

export type InstallmentStatus = "paid" | "pending" | "overdue";

export interface Installment {
  no: number;
  name: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  status: InstallmentStatus;
  /** Late fee if paid today (unpaid), or the late fee that was paid. */
  lateFee: number;
  payment?: FeePayment;
}
