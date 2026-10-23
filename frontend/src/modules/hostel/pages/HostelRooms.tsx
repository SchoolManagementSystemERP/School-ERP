import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { allocateRoom, isOut, useOutpasses, useResidents, useRooms, vacate } from "@/store/hostel";
import { useStudents } from "@/store/students";

/** Rooms with their residents; allocate students to free beds. */
export function HostelRooms() {
  const rooms = useRooms();
  const residents = useResidents();
  const passes = useOutpasses();
  const { students } = useStudents();
  const [pick, setPick] = useState<Record<number, string>>({});

  const resident = new Set(residents.map((r) => r.studentId));

  const allocate = (roomId: number) => {
    const id = Number(pick[roomId]);
    if (!id) return;
    allocateRoom(id, roomId);
    toast.success(`${students.find((s) => s.id === id)?.name} allocated`);
    setPick((p) => ({ ...p, [roomId]: "" }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms & Residents" description="Allocate beds; boys and girls are housed in separate blocks" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rooms.map((room) => {
          const inRoom = residents.filter((r) => r.roomId === room.id);
          const free = room.capacity - inRoom.length;
          const candidates = students.filter((s) => !resident.has(s.id) && s.gender === (room.type === "Boys" ? "Male" : "Female"));
          return (
            <Card key={room.id} className="gap-0">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BedDouble className="h-4 w-4 text-primary" /> Room {room.block}-{room.number}</CardTitle>
                <Badge variant={free ? "secondary" : "outline"}>{room.type} · {inRoom.length}/{room.capacity}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {inRoom.map((r) => {
                  const s = students.find((x) => x.id === r.studentId);
                  return (
                    <div key={r.studentId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{s?.name ?? "Former student"}</p>
                        <p className="text-xs text-muted-foreground">{s?.class} · since {r.since}{isOut(passes, r.studentId) ? " · on outpass" : ""}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Vacate" onClick={() => { vacate(r.studentId); toast.success(`${s?.name} vacated`); }}>
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                {free > 0 && (
                  <div className="flex gap-2 pt-1">
                    <Select value={pick[room.id] ?? ""} onValueChange={(v) => setPick({ ...pick, [room.id]: v })}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue placeholder={`${free} bed${free > 1 ? "s" : ""} free — add student`} /></SelectTrigger>
                      <SelectContent>{candidates.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.class}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" disabled={!pick[room.id]} onClick={() => allocate(room.id)}>Allocate</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
