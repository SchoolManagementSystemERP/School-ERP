import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Download,
  Home,
  Copy,
  Mail,
  Printer,
  Calendar,
  CreditCard,
  Hash,
  IndianRupee,
  User,
  GraduationCap,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentStudent } from "@/store/session";
import { useSectionBase } from "@/lib/section";

// In real app, get these from router query params or global state
// e.g. useSearchParams() → txnId, amount, installmentName
const mockPaymentData = {
  txnId: "TXN987654321",
  gatewayOrderId: "order_PQR123456",
  amount: 25000,
  lateFee: 0,
  totalPaid: 25000,
  installmentName: "Third Installment",
  paymentMethod: "UPI",
  upiId: "student@okicici",
  paidAt: new Date().toISOString(),
  student: {
    name: "",
    rollNo: "",
    class: "",
    school: "Delhi Public School",
    academicYear: "2025-26",
  },
};

export function StudentFeesSuccess() {
  const base = useSectionBase();
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const student = useCurrentStudent();

  useEffect(() => {
    // Slight delay so animation triggers after mount
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const routeState = (location.state || {}) as Partial<typeof mockPaymentData>;

  const data = {
    ...mockPaymentData,
    // overrides coming from StudentFees.tsx (navigate state)
    txnId: routeState.txnId ?? mockPaymentData.txnId,
    gatewayOrderId: (routeState as any).orderId ?? mockPaymentData.gatewayOrderId,
    amount: (routeState as any).amount ?? mockPaymentData.amount,
    installmentName: (routeState as any).installmentName ?? mockPaymentData.installmentName,
    lateFee: (routeState as any).lateFee ?? mockPaymentData.lateFee,
    student: {
      ...mockPaymentData.student,
      name: student?.name ?? "",
      rollNo: student?.admissionNo || student?.rollNo || "",
      class: student?.class ?? "",
      academicYear: student?.academicYear || mockPaymentData.student.academicYear,
    },
  };
  data.totalPaid = data.amount + data.lateFee;

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(data.paidAt));

  const handleCopyTxn = () => {
    navigator.clipboard.writeText(data.txnId);
    toast.success("Transaction ID copied");
  };

  const handleDownloadReceipt = () => {
    toast.success("Receipt Downloaded", {
      description: "Fee receipt PDF saved to your device",
    });
  };

  const handleEmailReceipt = () => {
    toast.success("Receipt Sent", {
      description: "Receipt emailed to your registered email ID",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="min-h-screen flex items-start justify-center px-4 py-12"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      <div className="w-full max-w-lg space-y-4">

        {/* Success header */}
        <div className="text-center space-y-3 py-4">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30"
            style={{
              transform: visible ? "scale(1)" : "scale(0.5)",
              transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s",
            }}
          >
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Payment Successful</h1>
            <p className="text-sm text-muted-foreground mt-1">{formattedDate}</p>
          </div>
          <div className="inline-flex items-center gap-1 text-4xl font-bold">
            <IndianRupee className="w-7 h-7" />
            {data.totalPaid.toLocaleString("en-IN")}
          </div>
          <Badge className="bg-green-600 hover:bg-green-600 text-white px-3 py-1">
            {data.installmentName}
          </Badge>
        </div>

        {/* Receipt card */}
        <Card className="border-border">
          <CardContent className="p-0">

            {/* Transaction details */}
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transaction Details
              </p>
              <div className="space-y-3">
                <Row icon={<Hash className="w-4 h-4" />} label="Transaction ID">
                  <span className="font-mono text-sm">{data.txnId}</span>
                  <button
                    onClick={handleCopyTxn}
                    className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Copy transaction ID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </Row>
                <Row icon={<Hash className="w-4 h-4" />} label="Order ID">
                  <span className="font-mono text-sm text-muted-foreground">{data.gatewayOrderId}</span>
                </Row>
                <Row icon={<CreditCard className="w-4 h-4" />} label="Payment Method">
                  <span>{data.paymentMethod}</span>
                  {data.upiId && (
                    <span className="text-muted-foreground text-xs ml-1">({data.upiId})</span>
                  )}
                </Row>
                <Row icon={<Calendar className="w-4 h-4" />} label="Paid On">
                  <span>{formattedDate}</span>
                </Row>
              </div>
            </div>

            <div className="border-t border-border border-dashed mx-5" />

            {/* Amount breakdown */}
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Amount Breakdown
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{data.installmentName}</span>
                  <span>₹{data.amount.toLocaleString("en-IN")}</span>
                </div>
                {data.lateFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-red-500">Late Fee</span>
                    <span className="text-red-500">₹{data.lateFee.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-2 border-t border-border">
                  <span>Total Paid</span>
                  <span className="text-green-600">₹{data.totalPaid.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border border-dashed mx-5" />

            {/* Student details */}
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Student Details
              </p>
              <div className="space-y-3">
                <Row icon={<User className="w-4 h-4" />} label="Name">
                  <span>{data.student.name}</span>
                </Row>
                <Row icon={<Hash className="w-4 h-4" />} label="Roll No.">
                  <span className="font-mono text-sm">{data.student.rollNo}</span>
                </Row>
                <Row icon={<GraduationCap className="w-4 h-4" />} label="Class">
                  <span>{data.student.class}</span>
                </Row>
                <Row icon={<Building2 className="w-4 h-4" />} label="School">
                  <span>{data.student.school}</span>
                </Row>
                <Row icon={<Calendar className="w-4 h-4" />} label="Academic Year">
                  <span>{data.student.academicYear}</span>
                </Row>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={handleDownloadReceipt}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={handleEmailReceipt} className="gap-2">
            <Mail className="w-4 h-4" />
            Email Receipt
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate(`${base}/fees`)}
          >
            <Home className="w-4 h-4" />
            Back to Fees
          </Button>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          This receipt has been sent to your registered email and phone number.
        </p>
      </div>
    </div>
  );
}

// Small helper component for consistent rows
function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-sm min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center text-sm font-medium text-right">{children}</div>
    </div>
  );
}