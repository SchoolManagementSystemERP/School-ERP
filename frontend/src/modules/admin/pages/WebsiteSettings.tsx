import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, ExternalLink, GraduationCap, Inbox, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { setFeedbackResolved, siteStore, updateSite, useAlumni, useFeedback, useSite, type SchoolSite } from "@/store/website";

function Field({ label, value, onChange, type = "text", hint }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Area({ label, value, onChange, rows = 4, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function WebsiteSettings() {
  const saved = useSite();
  const feedback = useFeedback();
  const alumni = useAlumni();
  const [d, setD] = useState<SchoolSite>(saved);
  const [kind, setKind] = useState("open");
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof SchoolSite>(k: K) => (v: SchoolSite[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (k: "established") => (v: string) => setD((x) => ({ ...x, [k]: Number(v) || 0 }));
  const stat = (k: keyof SchoolSite["stats"]) => (v: string) => setD((x) => ({ ...x, stats: { ...x.stats, [k]: Number(v) || 0 } }));

  function save() {
    if (!d.name.trim() || !d.phone.trim() || !d.email.trim()) {
      toast.error("School name, phone and email are required");
      return;
    }
    updateSite({ ...d, mission: d.mission.map((m) => m.trim()).filter(Boolean), branches: d.branches.filter((b) => b.name.trim()) });
    toast.success("Website updated");
  }

  const openCount = feedback.filter((f) => !f.resolved).length;
  const shownFeedback = feedback.filter((f) => (kind === "open" ? !f.resolved : kind === "all" ? true : f.kind === kind));

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Website"
        description="Edit what visitors see on the public website and read messages sent from it"
        actions={
          <>
            <Button variant="outline" className="gap-2" asChild><Link to="/school" target="_blank"><ExternalLink className="h-4 w-4" />Open website</Link></Button>
            <Button variant="outline" className="gap-2" disabled={!dirty} onClick={() => setD(saved)}><RotateCcw className="h-4 w-4" />Discard</Button>
            <Button className="gap-2" disabled={!dirty} onClick={save}><Save className="h-4 w-4" />Save changes</Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">Admissions {d.admissionYear}</p>
            <p className="text-sm text-muted-foreground">When open, the website shows an "Admissions open" banner and accepts enquiries (they appear under Reception → Enquiries).</p>
          </div>
          <div className="flex items-center gap-3">
            <Input className="w-28" value={d.admissionYear} onChange={(e) => set("admissionYear")(e.target.value)} aria-label="Admission year" />
            <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={d.admissionsOpen} onCheckedChange={set("admissionsOpen")} />{d.admissionsOpen ? "Open" : "Closed"}</label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="general">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="general">School details</TabsTrigger>
          <TabsTrigger value="home">Home page</TabsTrigger>
          <TabsTrigger value="about">About & messages</TabsTrigger>
          <TabsTrigger value="contact">Contact & campuses</TabsTrigger>
          <TabsTrigger value="inbox" className="gap-1.5">Inbox {openCount > 0 && <Badge className="h-5 px-1.5">{openCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="alumni">Alumni ({alumni.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="School name" value={d.name} onChange={set("name")} />
            <Field label="Short name / initials" value={d.shortName} onChange={set("shortName")} hint="Shown in the round crest logo" />
            <Field label="Tagline" value={d.tagline} onChange={set("tagline")} />
            <Field label="Motto" value={d.motto} onChange={set("motto")} />
            <Field label="Established (year)" type="number" value={d.established} onChange={num("established")} />
            <Field label="Board" value={d.board} onChange={set("board")} />
            <Field label="Affiliation number" value={d.affiliationNo} onChange={set("affiliationNo")} />
            <Field label="School code" value={d.schoolCode} onChange={set("schoolCode")} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="home" className="mt-4">
          <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Area label="Headline" rows={2} value={d.heroTitle} onChange={set("heroTitle")} />
            <Area label="Sub-headline" rows={3} value={d.heroSubtitle} onChange={set("heroSubtitle")} />
            <Field label="Number of students" type="number" value={d.stats.students} onChange={stat("students")} />
            <Field label="Number of teachers" type="number" value={d.stats.teachers} onChange={stat("teachers")} />
            <Field label="Board result (%)" type="number" value={d.stats.resultPercent} onChange={stat("resultPercent")} />
            <Field label="Campus size (acres)" type="number" value={d.stats.campusAcres} onChange={stat("campusAcres")} />
            <p className="text-sm text-muted-foreground sm:col-span-2">The notice board shows announcements sent to <b>everyone</b> from Communication. Fee structure comes from Accounts, faculty from Teachers and job openings from HR → Recruitment.</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="about" className="mt-4">
          <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Area label="About the school" rows={6} value={d.about} onChange={set("about")} hint="Leave an empty line between paragraphs." />
            <Area label="Vision" rows={2} value={d.vision} onChange={set("vision")} />
            <Area label="Mission (one point per line)" rows={4} value={d.mission.join("\n")} onChange={(v) => set("mission")(v.split("\n"))} />
            <Field label="Principal's name" value={d.principalName} onChange={set("principalName")} />
            <Field label="Principal's qualification" value={d.principalQualification} onChange={set("principalQualification")} />
            <Area label="Principal's message" rows={5} value={d.principalMessage} onChange={set("principalMessage")} />
            <Field label="Chairman's name" value={d.chairmanName} onChange={set("chairmanName")} />
            <div />
            <Area label="Chairman's message" rows={4} value={d.chairmanMessage} onChange={set("chairmanMessage")} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="contact" className="mt-4 space-y-4">
          <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Address" value={d.address} onChange={set("address")} />
            <Field label="City" value={d.city} onChange={set("city")} />
            <Field label="State" value={d.state} onChange={set("state")} />
            <Field label="PIN code" value={d.pincode} onChange={set("pincode")} />
            <Field label="Phone" value={d.phone} onChange={set("phone")} />
            <Field label="WhatsApp" value={d.whatsapp} onChange={set("whatsapp")} />
            <Field label="Email" type="email" value={d.email} onChange={set("email")} />
            <Field label="Office hours" value={d.officeHours} onChange={set("officeHours")} />
            <Field label="Facebook URL" value={d.social.facebook} onChange={(v) => setD((x) => ({ ...x, social: { ...x.social, facebook: v } }))} />
            <Field label="Instagram URL" value={d.social.instagram} onChange={(v) => setD((x) => ({ ...x, social: { ...x.social, instagram: v } }))} />
            <Field label="YouTube URL" value={d.social.youtube} onChange={(v) => setD((x) => ({ ...x, social: { ...x.social, youtube: v } }))} />
            <Field label="X (Twitter) URL" value={d.social.x} onChange={(v) => setD((x) => ({ ...x, social: { ...x.social, x: v } }))} />
          </CardContent></Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Campuses</CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setD((x) => ({ ...x, branches: [...x.branches, { name: "", address: "", phone: "" }] }))}><Plus className="h-4 w-4" />Add campus</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.branches.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.6fr_1fr_auto]">
                  <Input placeholder="Campus name" value={b.name} onChange={(e) => setD((x) => ({ ...x, branches: x.branches.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} aria-label="Campus name" />
                  <Input placeholder="Address" value={b.address} onChange={(e) => setD((x) => ({ ...x, branches: x.branches.map((y, j) => (j === i ? { ...y, address: e.target.value } : y)) }))} aria-label="Campus address" />
                  <Input placeholder="Phone" value={b.phone} onChange={(e) => setD((x) => ({ ...x, branches: x.branches.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)) }))} aria-label="Campus phone" />
                  <Button variant="ghost" size="icon" aria-label="Remove campus" onClick={() => setD((x) => ({ ...x, branches: x.branches.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inbox" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[["open", `Open (${openCount})`], ["all", "All"], ["Contact", "Contact"], ["Grievance", "Grievances"]].map(([k, l]) => (
              <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{l}</Button>
            ))}
          </div>
          {shownFeedback.length === 0 && <Card><CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground"><Inbox className="h-8 w-8" />Nothing here.</CardContent></Card>}
          {shownFeedback.map((f) => (
            <Card key={f.id} className="gap-0">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{f.subject}</p>
                    <Badge variant={f.kind === "Grievance" ? "destructive" : "outline"}>{f.kind}</Badge>
                    {f.resolved && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Resolved</span>}
                  </div>
                  <p className="mt-1 text-sm text-foreground/80">{f.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.name} · {f.phone}{f.email && ` · ${f.email}`} · {f.date}</p>
                </div>
                <Button size="sm" variant={f.resolved ? "outline" : "default"} onClick={() => { setFeedbackResolved(f.id, !f.resolved); toast.success(f.resolved ? "Reopened" : "Marked resolved"); }}>
                  {f.resolved ? "Reopen" : "Mark resolved"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="alumni" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {alumni.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground"><GraduationCap className="h-8 w-8" />No alumni registrations yet. Share the website's Alumni page with former students.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-border text-left text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Batch</th><th className="px-4 py-3 font-medium">Occupation</th><th className="px-4 py-3 font-medium">City</th><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Registered</th></tr></thead>
                    <tbody>
                      {alumni.map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium text-foreground">{a.name}</td><td className="px-4 py-3">{a.batch}</td><td className="px-4 py-3">{a.occupation || "—"}</td><td className="px-4 py-3">{a.city || "—"}</td><td className="px-4 py-3 text-muted-foreground">{a.email}{a.phone && <><br />{a.phone}</>}</td><td className="px-4 py-3 text-muted-foreground">{a.date}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Saved changes go live on the school website at once. <button type="button" className="text-xs underline" onClick={() => { setD(siteStore.get()); toast.info("Unsaved changes discarded"); }}>Discard unsaved changes</button>
      </p>
    </div>
  );
}
