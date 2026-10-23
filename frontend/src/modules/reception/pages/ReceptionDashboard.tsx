import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, DoorOpen, PhoneCall, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { today } from "@/lib/dates";
import { useEnquiries, useVisitors } from "@/store/frontOffice";

export function ReceptionDashboard() {
  const enquiries = useEnquiries();
  const visitors = useVisitors();
  const todayVisitors = visitors.filter((v) => v.date === today());
  const inside = todayVisitors.filter((v) => !v.outTime);
  const open = enquiries.filter((e) => e.status !== "Admitted" && e.status !== "Closed");
  const followUps = open.filter((e) => e.followUp && e.followUp <= today());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Front Office"
        description="Visitors, admission enquiries and new admissions"
        actions={
          <>
            <Button variant="outline" asChild><Link to="/reception/visitors">Check In Visitor</Link></Button>
            <Button asChild><Link to="/reception/enquiries">New Enquiry</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Visitors today" value={todayVisitors.length} icon={Users} tone="indigo" hint={`${inside.length} still inside`} href="/reception/visitors" />
        <StatCard label="Open enquiries" value={open.length} icon={PhoneCall} tone="blue" href="/reception/enquiries" />
        <StatCard label="Follow-ups due" value={followUps.length} icon={CalendarClock} tone="amber" />
        <StatCard label="Admitted from enquiries" value={enquiries.filter((e) => e.status === "Admitted").length} icon={UserPlus} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><DoorOpen className="h-4 w-4 text-primary" /> In the Building</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {inside.length === 0 && <p className="text-sm text-muted-foreground">No visitors inside right now.</p>}
            {inside.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.purpose} · meeting {v.toMeet}</p>
                </div>
                <Badge variant="secondary">In since {v.inTime}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-600" /> Follow-ups Due</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {followUps.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups due today.</p>}
            {followUps.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{e.studentName} <span className="text-muted-foreground font-normal">· Class {e.grade}</span></p>
                  <p className="text-xs text-muted-foreground">{e.parentName} · {e.phone}</p>
                </div>
                <Badge variant="outline">{e.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
