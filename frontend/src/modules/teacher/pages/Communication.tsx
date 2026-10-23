import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, Bell, MessageSquare, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  audienceLabel, isVisibleTo, markMessageRead, messagesFor, postAnnouncement, removeAnnouncement,
  sendMessage, timeAgo, useAnnouncements, useMessages,
} from "@/store/communication";
import { teacherClasses, useCurrentTeacher } from "@/store/session";
import { useClassRoster } from "@/store/students";
import type { Announcement, Message } from "@/types/communication";

const ALL_MY_CLASSES = "__all__";

export function Communication() {
  const teacher = useCurrentTeacher();
  const { classes: allClasses, byClass } = useClassRoster();
  const classes = teacherClasses(teacher, allClasses);
  const announcements = useAnnouncements();
  const messages = useMessages();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    recipient: "",
    priority: "medium" as Announcement["priority"],
  });
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [replyText, setReplyText] = useState("");

  const me = teacher ? { role: "teacher" as const, id: teacher.id, name: teacher.name } : null;
  const mine = announcements.filter((a) => a.from === teacher?.name);
  const fromSchool = announcements.filter((a) => a.from !== teacher?.name && isVisibleTo(a, { role: "staff" }));
  const { inbox } = me ? messagesFor(messages, me) : { inbox: [] as Message[] };
  const unreadCount = inbox.filter((m) => !m.read).length;
  const studentClass = (id: number) => Object.values(byClass).flat().find((s) => s.id === id)?.class ?? "";
  const totalRecipients = classes.reduce((a, c) => a + (byClass[c]?.length ?? 0), 0);

  const handleSendAnnouncement = () => {
    if (!formData.title || !formData.message || !formData.recipient || !teacher) {
      toast.error("Please fill all required fields");
      return;
    }
    postAnnouncement({
      title: formData.title,
      content: formData.message,
      from: teacher.name,
      fromRole: "teacher",
      audience: formData.recipient === ALL_MY_CLASSES ? classes : [formData.recipient],
      category: "academic",
      priority: formData.priority,
    });
    toast.success("Announcement sent! Students in the class can see it now.");
    setDialogOpen(false);
    setFormData({ title: "", message: "", recipient: "", priority: "medium" });
  };

  const openReply = (m: Message) => {
    markMessageRead(m.id);
    setReplyTo(m);
    setReplyText("");
  };

  const handleReply = () => {
    if (!replyTo || !me || !replyText.trim()) {
      toast.error("Please type a reply");
      return;
    }
    sendMessage(me, replyTo.from, `Re: ${replyTo.subject}`, replyText.trim());
    toast.success(`Reply sent to ${replyTo.from.name}`);
    setReplyTo(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Communication</h1>
          <p className="text-sm text-muted-foreground mt-1">Send announcements to your classes and reply to students</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Recipient *</Label>
                  <Select value={formData.recipient} onValueChange={(value) => setFormData({ ...formData, recipient: value })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_MY_CLASSES}>All my classes</SelectItem>
                      {classes.map((cls) => <SelectItem key={cls} value={cls}>{cls}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={formData.priority} onValueChange={(value: Announcement["priority"]) => setFormData({ ...formData, priority: value })}>
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
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Announcement title"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Message *</Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Type your message here..."
                  className="mt-2"
                  rows={5}
                />
              </div>

              <Button className="w-full" onClick={handleSendAnnouncement}>
                <Send className="h-4 w-4 mr-2" />
                Send Announcement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "My Announcements", value: mine.length, icon: Bell, bg: "bg-blue-100 dark:bg-blue-950", color: "text-blue-600" },
          { label: "Unread Messages", value: unreadCount, icon: MessageSquare, bg: "bg-green-100 dark:bg-green-950", color: "text-green-600" },
          { label: "Students in My Classes", value: totalRecipients, icon: Users, bg: "bg-purple-100 dark:bg-purple-950", color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`${s.bg} p-2 rounded-lg`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-sm text-foreground/60">{s.label}</p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="announcements" className="space-y-4">
        <TabsList>
          <TabsTrigger value="announcements">My Announcements</TabsTrigger>
          <TabsTrigger value="school">From School ({fromSchool.length})</TabsTrigger>
          <TabsTrigger value="messages">
            Student Messages
            {unreadCount > 0 && <Badge className="ml-2 bg-red-500">{unreadCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-4">
          {mine.length === 0 && <p className="text-sm text-foreground/50">You have not sent any announcements yet.</p>}
          {mine.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
                    <Bell className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-lg">{a.title}</h3>
                    <p className="text-sm text-foreground/70 mt-2">{a.content}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <Badge variant="outline">{audienceLabel(a.audience)}</Badge>
                      <Badge variant="secondary">{a.priority}</Badge>
                      <span className="text-xs text-foreground/50">{a.date}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="text-destructive"
                    onClick={() => { removeAnnouncement(a.id); toast.success("Announcement deleted"); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="school" className="space-y-4">
          {fromSchool.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground">{a.title}</h3>
                <p className="text-sm text-foreground/70 mt-2">{a.content}</p>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-foreground/50">
                  <Badge variant="outline">{a.from}</Badge>
                  <span>{audienceLabel(a.audience)}</span>
                  <span>{a.date}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          {inbox.length === 0 && <p className="text-sm text-foreground/50">No messages from students.</p>}
          {inbox.map((message) => (
            <Card key={message.id} className={!message.read ? "border-blue-500" : ""}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-foreground">{message.from.name}</h3>
                      {message.from.role !== "teacher" && <Badge variant="outline" className="text-xs">{message.from.role === "parent" ? "Parent · " : ""}{studentClass(message.from.id)}</Badge>}
                      {!message.read && <Badge className="bg-blue-500">New</Badge>}
                    </div>
                    <p className="text-sm font-medium text-foreground/80 mt-2">{message.subject}</p>
                    <p className="text-sm text-foreground/70 mt-1">{message.body}</p>
                    <p className="text-xs text-foreground/50 mt-2">{timeAgo(message.sentAt)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openReply(message)}>
                    <Send className="h-4 w-4 mr-1" />
                    Reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Reply dialog */}
      <Dialog open={!!replyTo} onOpenChange={(open) => !open && setReplyTo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reply to {replyTo?.from.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-accent/40 p-3 text-sm text-foreground/70">
              <p className="font-medium text-foreground">{replyTo?.subject}</p>
              <p className="mt-1">{replyTo?.body}</p>
            </div>
            <Textarea rows={5} placeholder="Type your reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            <Button className="w-full" onClick={handleReply}>
              <Send className="h-4 w-4 mr-2" />
              Send Reply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
