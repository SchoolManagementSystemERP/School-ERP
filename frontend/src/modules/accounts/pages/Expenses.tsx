import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { today } from "@/lib/dates";
import { downloadCsv } from "@/store/inventory";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, addExpense, inr, monthLabel, monthOf, removeExpense, useExpenses } from "@/store/finance";

const empty = { date: today(), category: "", description: "", amount: "", paidTo: "", method: PAYMENT_METHODS[0] };

export function Expenses() {
  const expenses = useExpenses();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [month, setMonth] = useState("all");
  const [category, setCategory] = useState("all");

  const months = [...new Set(expenses.map((e) => monthOf(e.date)))].sort().reverse();
  const shown = expenses
    .filter((e) => (month === "all" || monthOf(e.date) === month) && (category === "all" || e.category === category))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = shown.reduce((a, e) => a + e.amount, 0);

  const save = () => {
    const amount = Number(form.amount);
    if (!form.category || !form.description.trim() || !amount || amount <= 0) {
      toast.error("Category, description and a positive amount are required");
      return;
    }
    addExpense({ ...form, description: form.description.trim(), paidTo: form.paidTo.trim(), amount });
    toast.success("Expense recorded");
    setOpen(false);
    setForm(empty);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Bills, purchases and other school spending"
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("expenses.csv", ["Date", "Category", "Description", "Paid To", "Method", "Amount"], shown.map((e) => [e.date, e.category, e.description, e.paidTo, e.method, e.amount]))}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="sm:ml-auto text-sm text-muted-foreground">{shown.length} entries · <span className="font-semibold text-foreground">{inr(total)}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Expense Register</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {shown.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No expenses.</p>}
          {shown.map((e) => (
            <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm text-foreground">{e.description}</p>
                  <Badge variant="secondary">{e.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{e.date} · {e.paidTo || "—"} · {e.method}</p>
              </div>
              <p className="font-semibold text-foreground">{inr(e.amount)}</p>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => { removeExpense(e.id); toast.success("Expense deleted"); }} aria-label="Delete expense">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Generator servicing" /></div>
            <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label>Paid to</Label><Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
