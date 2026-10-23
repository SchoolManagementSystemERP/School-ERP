import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { decideLeave, leaveDays, useLeaves, type LeaveRequest } from "@/store/hr";

const STATUS_STYLE: Record<LeaveRequest["status"], string> = {
  Pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function LeaveRequests() {
  const leaves = useLeaves();
  const [tab, setTab] = useState<"Pending" | "all">("Pending");
  const shown = leaves.filter((l) => tab === "all" || l.status === tab).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));

  const decide = (l: LeaveRequest, status: "Approved" | "Rejected") => {
    decideLeave(l.id, status);
    toast.success(`${l.person.name}'s leave ${status.toLowerCase()}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leave Requests" description="Teachers apply from their portal; approve or reject them here" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="Pending">Pending ({leaves.filter((l) => l.status === "Pending").length})</TabsTrigger>
          <TabsTrigger value="all">All ({leaves.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {shown.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No leave requests.</CardContent></Card>}
        {shown.map((l) => (
          <Card key={l.id} className="gap-0">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{l.person.name}</p>
                  <Badge variant="outline">{l.person.kind === "teacher" ? "Teacher" : "Staff"}</Badge>
                  <Badge variant="secondary">{l.type}</Badge>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {l.from} → {l.to} · {leaveDays(l)} day{leaveDays(l) > 1 ? "s" : ""} · “{l.reason}”
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Applied {l.appliedOn}{l.decidedOn ? ` · decided ${l.decidedOn}` : ""}</p>
              </div>
              {l.status === "Pending" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => decide(l, "Rejected")}><X className="h-4 w-4" /> Reject</Button>
                  <Button size="sm" className="gap-1" onClick={() => decide(l, "Approved")}><Check className="h-4 w-4" /> Approve</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
