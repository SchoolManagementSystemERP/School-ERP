import { useState } from "react";
import { useNavigate } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DollarSign,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Receipt,
  TrendingUp,
  Eye,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { feeAccount, lateFeeFor, payInstallment, useFeePayments } from "@/store/fees";
import { useCurrentStudent } from "@/store/session";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useSectionBase } from "@/lib/section";

export function StudentFees() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const [showInvoice, setShowInvoice] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [payingId, setPayingId] = useState<number | null>(null); // loading state

  const student = useCurrentStudent();
  const payments = useFeePayments();
  const account = student ? feeAccount(student, payments) : null;

  const feeStructure = {
    academicYear: student?.academicYear || "2025-26",
    totalAnnualFees: account?.total ?? 0,
    paidAmount: account?.paid ?? 0,
    pendingAmount: account?.pending ?? 0,
    installments: (account?.installments ?? []).map((i) => ({
      id: i.no,
      name: i.name,
      amount: i.amount,
      dueDate: i.dueDate,
      paidDate: i.payment?.date ?? null,
      // overdue installments can still be paid (with a late fee)
      status: i.status === "paid" ? "paid" : "pending",
      method: i.payment?.method ?? null,
      txn: i.payment?.txnId ?? null,
      lateFee: i.lateFee,
    })),
  };

  // Cumulative amount paid at the end of each month from the first due date until now
  const paymentTrend = (() => {
    if (!account) return [];
    const start = new Date(`${account.installments[0].dueDate}T00:00:00`);
    const months: { month: string; paid: number; pending: number }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const now = new Date();
    while (cursor <= now) {
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).toISOString().slice(0, 10);
      const paid = account.installments.filter((i) => i.payment && i.payment.date <= end).reduce((a, i) => a + i.amount, 0);
      months.push({ month: cursor.toLocaleString("en-IN", { month: "short" }), paid, pending: account.total - paid });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  })();

  const percentagePaid = feeStructure.totalAnnualFees ? (feeStructure.paidAmount / feeStructure.totalAnnualFees) * 100 : 100;

  const calculateLateFee = (dueDate: string) => lateFeeFor(dueDate);

  const handlePayNow = (inst: (typeof feeStructure.installments)[number]) => {
    if (!student) return;
    const lateFee = calculateLateFee(inst.dueDate);
    if (lateFee > 0) {
      toast.warning(`Late fee of ₹${lateFee} applicable`);
    }

    setPayingId(inst.id);
    toast.success("Processing payment...");

    // gateway step, then record the payment (the server confirms amount, late fee and receipt)
    setTimeout(async () => {
      const payment = await payInstallment(student, inst.id, "UPI").catch(() => undefined);
      setPayingId(null);
      if (!payment) return;
      navigate(`${base}/fees/success`, {
        state: {
          txnId: payment.txnId,
          orderId: "ORD" + payment.id,
          amount: payment.amount,
          lateFee: payment.lateFee,
          installmentName: inst.name,
        },
      });
    }, 1500);
  };

  const handleViewInvoice = (inst: any) => {
    setSelectedInstallment(inst);
    setShowInvoice(true);
  };

  const canDownloadReceipt = (inst: any) => {
    return Boolean(inst && inst.status === "paid" && inst.txn);
  };

  const saveText = (fileName: string, lines: string[]) => {
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStatement = () => {
    if (!student || !account) return;
    saveText(`fee-statement-${student.rollNo}.txt`, [
      `Fee Statement — Academic Year ${feeStructure.academicYear}`,
      `Student: ${student.name} (${student.class}, Roll ${student.rollNo})`,
      `Total: ₹${account.total}   Paid: ₹${account.paid}   Pending: ₹${account.pending}`,
      "",
      ...account.installments.map((i) =>
        `${i.name}: ₹${i.amount} · due ${i.dueDate} · ${i.payment ? `paid ${i.payment.date} via ${i.payment.method} (${i.payment.txnId})${i.payment.lateFee ? ` + late fee ₹${i.payment.lateFee}` : ""}` : i.status.toUpperCase()}`),
    ]);
    toast.success("Fee statement downloaded");
  };

  const handleDownloadReceipt = (txn: string | null) => {
    const inst = account?.installments.find((i) => i.payment?.txnId === txn);
    if (!student || !inst?.payment) return;
    saveText(`receipt-${txn}.txt`, [
      "FEE RECEIPT",
      `Student: ${student.name} (${student.class}, Roll ${student.rollNo})`,
      `${inst.name}: ₹${inst.amount}${inst.payment.lateFee ? ` + late fee ₹${inst.payment.lateFee}` : ""}`,
      `Paid on ${inst.payment.date} via ${inst.payment.method}`,
      `Transaction ID: ${inst.payment.txnId}`,
    ]);
    toast.success("Receipt downloaded", { description: `TXN: ${txn}` });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Fee Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Academic Year {feeStructure.academicYear}</p>
        </div>
        <Button onClick={handleDownloadStatement} size="lg" className="gap-2">
          <Download className="h-5 w-5" />
          Download Statement
        </Button>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <CardContent className="p-8">
            <p className="opacity-75">Total Fees</p>
            <p className="text-5xl font-bold mt-3">₹{feeStructure.totalAnnualFees.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-500/30">
          <CardContent className="p-8">
            <p className="text-green-700 dark:text-green-300">Paid</p>
            <p className="text-5xl font-bold text-green-600 mt-3">₹{feeStructure.paidAmount.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 dark:border-orange-500/30">
          <CardContent className="p-8">
            <p className="text-orange-700 dark:text-orange-300">Pending</p>
            <p className="text-5xl font-bold text-orange-600 mt-3">₹{feeStructure.pendingAmount.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Overall Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <div className="relative w-56 h-56">
              <svg className="w-full h-full -rotate-12" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" strokeWidth="14" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="#10b981" strokeWidth="14"
                  strokeDasharray={`${percentagePaid * 3.27} 327`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-6xl font-bold">{percentagePaid.toFixed(0)}%</p>
                <p className="text-sm text-muted-foreground">PAID</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Payment Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={paymentTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area type="natural" dataKey="paid" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                <Area type="natural" dataKey="pending" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Installments */}
      <Card>
        <CardHeader>
          <CardTitle>Installment Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {feeStructure.installments.map((inst) => {
            const lateFee = inst.status === "pending" ? calculateLateFee(inst.dueDate) : 0;
            const isLoading = payingId === inst.id;

            return (
              <div key={inst.id} className="border border-border rounded-2xl p-6 hover:shadow-lg transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold">{inst.name}</h3>
                    <p className="text-3xl font-bold mt-2">₹{inst.amount.toLocaleString()}</p>
                  </div>
                  {inst.status === "paid" ? (
                    <Badge className="bg-green-600">PAID</Badge>
                  ) : (
                    <Badge variant="secondary">PENDING</Badge>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">DUE DATE</p>
                    <p className="font-medium">{inst.dueDate}</p>
                  </div>
                  {inst.paidDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">PAID ON</p>
                      <p className="font-medium text-green-600">{inst.paidDate}</p>
                    </div>
                  )}
                  {lateFee > 0 && (
                    <div>
                      <p className="text-xs text-red-500">LATE FEE</p>
                      <p className="font-medium text-red-600">₹{lateFee}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  {inst.status === "pending" && (
                    <Button
                      className="flex-1"
                      onClick={() => handlePayNow(inst)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-5 w-5" />
                          Pay Now
                        </>
                      )}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => handleViewInvoice(inst)}>
                    <Eye className="mr-2 h-5 w-5" />
                    View Invoice
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Invoice Preview Modal */}
      <Dialog open={showInvoice} onOpenChange={setShowInvoice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
          </DialogHeader>
          {selectedInstallment && (
            <div className="space-y-6 py-4">
              <div className="text-center border-b pb-4">
                <p className="font-mono text-sm">INVOICE</p>
                <p className="text-2xl font-bold">₹{selectedInstallment.amount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">{selectedInstallment.name}</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Student Name</span>
                  <span className="font-medium">Gulshan Kumar</span>
                </div>
                <div className="flex justify-between">
                  <span>Due Date</span>
                  <span>{selectedInstallment.dueDate}</span>
                </div>
                {selectedInstallment.paidDate ? (
                  <div className="flex justify-between">
                    <span>Paid Date</span>
                    <span className="text-green-600">{selectedInstallment.paidDate}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>Paid Date</span>
                    <span className="text-muted-foreground">Not paid yet</span>
                  </div>
                )}
                {selectedInstallment.txn ? (
                  <div className="flex justify-between">
                    <span>Transaction ID</span>
                    <span className="font-mono text-xs">{selectedInstallment.txn}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>Transaction ID</span>
                    <span className="text-muted-foreground">—</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                disabled={!canDownloadReceipt(selectedInstallment)}
                onClick={() => handleDownloadReceipt(selectedInstallment.txn)}
              >
                <Download className="mr-2 h-4 w-4" />
                {canDownloadReceipt(selectedInstallment)
                  ? "Download PDF Invoice"
                  : "Pay to Download PDF Invoice"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Notice */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 dark:border-amber-500/30">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <AlertCircle className="h-6 w-6 text-amber-600 mt-1" />
            <div>
              <p className="font-semibold">Payment Reminder</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Third installment due on <strong>31 May 2026</strong>. Late fee applies after due date.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}