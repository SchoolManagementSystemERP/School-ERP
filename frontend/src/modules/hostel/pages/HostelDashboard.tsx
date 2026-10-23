import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BedDouble, DoorOpen, LogOut, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { isOut, useOutpasses, useResidents, useRooms } from "@/store/hostel";
import { useStudents } from "@/store/students";

export function HostelDashboard() {
  const rooms = useRooms();
  const residents = useResidents();
  const passes = useOutpasses();
  const { students } = useStudents();

  const beds = rooms.reduce((a, r) => a + r.capacity, 0);
  const away = residents.filter((r) => isOut(passes, r.studentId));
  const pending = passes.filter((p) => p.status === "Pending");
  const name = (id: number) => students.find((s) => s.id === id)?.name ?? "Former student";

  const blocks = [...new Set(rooms.map((r) => r.block))].map((block) => {
    const inBlock = rooms.filter((r) => r.block === block);
    const cap = inBlock.reduce((a, r) => a + r.capacity, 0);
    const used = residents.filter((x) => inBlock.some((r) => r.id === x.roomId)).length;
    return { block, type: inBlock[0]?.type, cap, used };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Hostel" description="Rooms, residents and outpasses" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Residents" value={residents.length} icon={Users} tone="indigo" href="/hostel/rooms" />
        <StatCard label="Beds free" value={beds - residents.length} icon={BedDouble} tone="green" hint={`${beds} beds in ${rooms.length} rooms`} />
        <StatCard label="Away on outpass" value={away.length} icon={LogOut} tone="amber" />
        <StatCard label="Outpass requests" value={pending.length} icon={DoorOpen} tone="orange" href="/hostel/outpass" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Occupancy by Block</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {blocks.map((b) => (
              <div key={b.block}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground">Block {b.block} <span className="text-muted-foreground font-normal">· {b.type}</span></span>
                  <span className="text-muted-foreground">{b.used}/{b.cap}</span>
                </div>
                <Progress value={b.cap ? (b.used / b.cap) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Away Today</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {away.length === 0 && <p className="text-sm text-muted-foreground">All residents are in the hostel.</p>}
            {away.map((r) => <Badge key={r.studentId} variant="outline" className="py-1">{name(r.studentId)}</Badge>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
