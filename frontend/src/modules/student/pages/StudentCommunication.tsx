import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Bell, Send, AlertCircle, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isVisibleTo, markMessageRead, messagesFor, sendMessage, useAnnouncements, useMessages } from "@/store/communication";
import { useCurrentStudent } from "@/store/session";
import { useTeachers } from "@/store/teachers";
import { useSectionBase } from "@/lib/section";

export function StudentCommunication() {
  const base = useSectionBase();
  const student = useCurrentStudent();
  const { teachers } = useTeachers();
  const allAnnouncements = useAnnouncements();
  const allMessages = useMessages();
  const [newMessage, setNewMessage] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const announcements = allAnnouncements
    .filter((a) => student && isVisibleTo(a, { role: "student", cls: student.class }))
    .map((a) => ({ ...a, type: a.category }));

  // in the parent portal messages are sent by (and to) the child's parent
  const me = student
    ? base === "/parent"
      ? { role: "parent" as const, id: student.id, name: `Parent of ${student.name}` }
      : { role: "student" as const, id: student.id, name: student.name }
    : null;
  const { inbox } = me ? messagesFor(allMessages, me) : { inbox: [] };
  const messages = inbox.map((m) => {
    const d = new Date(m.sentAt);
    return {
      id: m.id,
      from: m.from.name,
      subject: m.subject,
      message: m.body,
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      read: m.read,
    };
  });

  const handleSendMessage = () => {
    const teacher = teachers.find((t) => String(t.id) === teacherId);
    if (!teacher || !messageSubject.trim() || !newMessage.trim() || !me) {
      toast.error("Please choose a teacher and fill in all fields");
      return;
    }
    sendMessage(me, { role: "teacher", id: teacher.id, name: teacher.name }, messageSubject.trim(), newMessage.trim());
    toast.success(`Message sent to ${teacher.name}`);
    setMessageSubject("");
    setNewMessage("");
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive">High Priority</Badge>;
      case "medium":
        return <Badge variant="secondary">Medium Priority</Badge>;
      case "low":
        return <Badge variant="outline">Low Priority</Badge>;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      academic: "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300",
      fees: "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300",
      event: "bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-300",
      general: "bg-muted text-foreground",
    };
    return (
      <Badge variant="secondary" className={colors[type] || ""}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Communication</h1>
        <p className="text-sm text-muted-foreground mt-1">Announcements and messages from teachers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Announcements</p>
                <p className="text-2xl font-bold text-foreground mt-1">{announcements.length}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 p-3 rounded-lg">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unread Messages</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {messages.filter((m) => !m.read).length}
                </p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-500/10 p-3 rounded-lg">
                <MessageSquare className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {announcements.filter((a) => a.priority === "high").length}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="announcements" className="w-full">
        <TabsList>
          <TabsTrigger value="announcements">
            Announcements ({announcements.length})
          </TabsTrigger>
          <TabsTrigger value="messages">
            Messages ({messages.filter((m) => !m.read).length} unread)
          </TabsTrigger>
          <TabsTrigger value="send">Send Message</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="mt-6 space-y-4">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{announcement.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      {getPriorityBadge(announcement.priority)}
                      {getTypeBadge(announcement.type)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-foreground/80">{announcement.content}</p>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    {announcement.from}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {announcement.date}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="messages" className="mt-6 space-y-4">
          {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          {messages.map((message) => (
            <Card key={message.id} className={!message.read ? "border-blue-300 dark:border-blue-500/30 bg-blue-50/30 cursor-pointer" : ""} onClick={() => !message.read && markMessageRead(message.id)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{message.subject}</CardTitle>
                      {!message.read && <Badge variant="default">New</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">From: {message.from}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-foreground/80">{message.message}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {message.date}
                  </div>
                  <span>{message.time}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="send" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Message to Teacher
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground/80 mb-2 block">To</label>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="Choose a teacher" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name} — {t.department}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground/80 mb-2 block">Subject</label>
                <Input
                  type="text"
                  placeholder="Enter message subject"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground/80 mb-2 block">Message</label>
                <Textarea
                  placeholder="Type your message here..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={8}
                />
              </div>
              <Button onClick={handleSendMessage} className="w-full gap-2">
                <Send className="h-4 w-4" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
