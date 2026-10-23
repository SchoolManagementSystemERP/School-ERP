import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Megaphone, MessageSquare, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { authStore } from "@/store/auth";
import { audienceLabel, postAnnouncement, removeAnnouncement, useAnnouncements, useMessages } from "@/store/communication";
import { useClassRoster } from "@/store/students";
import type { Announcement } from "@/types/communication";

const PRIORITY_STYLE: Record<Announcement["priority"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-muted text-foreground/80",
};

const emptyForm = {
  title: "",
  content: "",
  audience: "everyone",
  category: "general" as Announcement["category"],
  priority: "medium" as Announcement["priority"],
};

export function PrincipalCommunication() {
  const announcements = useAnnouncements();
  const messages = useMessages();
  const { classes, byClass } = useClassRoster();
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("all");

  const reach = (audience: string) => {
    const students = Object.values(byClass).flat().length;
    if (audience === "everyone") return `${students} students + all staff`;
    if (audience === "students") return `${students} students`;
    if (audience === "staff") return "All teaching staff";
    return `${byClass[audience]?.length ?? 0} students`;
  };

  const handlePost = () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Please add a title and message");
      return;
    }
    postAnnouncement({
      title: form.title.trim(),
      content: form.content.trim(),
      from: authStore.get().me?.user.name ?? "Principal",
      fromRole: "principal",
      audience: [form.audience],
      category: form.category,
      priority: form.priority,
    });
    toast.success(`Announcement sent to ${audienceLabel([form.audience])}`);
    setForm(emptyForm);
  };

  const shown = announcements.filter((a) => filter === "all" || a.fromRole === filter);

  const stats = [
    { label: "Announcements", value: announcements.length, icon: Megaphone, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "From Principal", value: announcements.filter((a) => a.fromRole === "principal").length, icon: Bell, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "From Teachers", value: announcements.filter((a) => a.fromRole === "teacher").length, icon: Users, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Student–Teacher Messages", value: messages.length, icon: MessageSquare, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Communication</h1>
        <p className="text-sm text-muted-foreground mt-1">Broadcast announcements to staff and students</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-foreground/60 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Compose */}
        <Card className="lg:col-span-2 h-fit">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4 text-violet-600" /> New Announcement</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Send to</Label>
              <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="staff">All Staff</SelectItem>
                  <SelectItem value="students">All Students</SelectItem>
                  {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground/50 mt-1">Reaches {reach(form.audience)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v: Announcement["category"]) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="academic">Academic</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="fees">Fees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: Announcement["priority"]) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input className="mt-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. School closed on Monday" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea className="mt-2" rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the announcement..." />
            </div>
            <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" onClick={handlePost}>
              <Send className="h-4 w-4 mr-2" /> Send Announcement
            </Button>
          </CardContent>
        </Card>

        {/* Feed */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">All Announcements</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All senders</SelectItem>
                <SelectItem value="principal">Principal</SelectItem>
                <SelectItem value="teacher">Teachers</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {shown.length === 0 && <p className="text-sm text-foreground/50 text-center py-8">No announcements.</p>}
            {shown.map((a) => (
              <div key={a.id} className="p-4 border border-border rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{a.title}</p>
                    <p className="text-sm text-foreground/70 mt-1">{a.content}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="text-destructive shrink-0"
                    onClick={() => { removeAnnouncement(a.id); toast.success("Announcement removed"); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[a.priority]}`}>{a.priority}</span>
                  <Badge variant="outline">{audienceLabel(a.audience)}</Badge>
                  <Badge variant="secondary">{a.category}</Badge>
                  <span className="text-foreground/50">{a.from} · {a.date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
