import { useState } from "react";
import { Link } from "react-router";
import { Briefcase, CalendarClock, ExternalLink, FileText, Mail, Pencil, Phone, Plus, Search, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { daysFromToday } from "@/lib/dates";
import {
  APPLICATION_STATUSES, EMPLOYMENT_TYPES, JOB_CATEGORIES, isAcceptingApplications, saveJob, setJobOpen, updateApplication, useApplications, useJobs,
  type ApplicationStatus, type JobOpening,
} from "@/store/recruitment";
import { useSite } from "@/store/website";

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  Applied: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  Shortlisted: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Interview: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Selected: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-muted text-muted-foreground",
};

type JobDraft = Omit<JobOpening, "id" | "postedOn" | "responsibilities"> & { id?: number; responsibilities: string };

export function Recruitment() {
  const jobs = useJobs();
  const applications = useApplications();
  const site = useSite();
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [draft, setDraft] = useState<JobDraft | null>(null);

  const jobTitle = (id: number | null) => (id === null ? "General application" : jobs.find((j) => j.id === id)?.title ?? "Closed position");
  const open = jobs.filter(isAcceptingApplications);
  const q = search.toLowerCase();
  const shown = applications.filter((a) =>
    (jobFilter === "all" || String(a.jobId) === jobFilter) &&
    (statusFilter === "all" || (statusFilter === "active" ? a.status !== "Rejected" && a.status !== "Selected" : a.status === statusFilter)) &&
    (!q || `${a.name} ${a.qualification} ${a.phone} ${a.email}`.toLowerCase().includes(q)),
  );

  const blankJob = (): JobDraft => ({
    title: "", department: "", category: "Teaching", employmentType: "Full-time", campus: site.branches[0]?.name ?? "", vacancies: 1,
    qualification: "", experience: "", salary: "", description: "", responsibilities: "", lastDate: daysFromToday(21), isOpen: true,
  });

  function saveDraft() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.department.trim() || !draft.qualification.trim() || !draft.description.trim() || draft.vacancies < 1) {
      toast.error("Title, department, qualification, description and vacancies are required");
      return;
    }
    saveJob({ ...draft, title: draft.title.trim(), responsibilities: draft.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean) });
    toast.success(draft.id ? "Job updated" : "Job posted — it is now on the website's Careers page");
    setDraft(null);
  }

  const setStatus = (id: number, status: ApplicationStatus, name: string) => {
    updateApplication(id, { status });
    toast.success(`${name}: ${status}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment"
        description="Post jobs on the school website and manage applications"
        actions={
          <>
            <Button variant="outline" className="gap-2" asChild><Link to="/school/careers" target="_blank"><ExternalLink className="h-4 w-4" />View careers page</Link></Button>
            <Button className="gap-2" onClick={() => setDraft(blankJob())}><Plus className="h-4 w-4" />Post a job</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open positions" value={open.length} icon={Briefcase} tone="indigo" hint={`${open.reduce((s, j) => s + j.vacancies, 0)} vacancies`} />
        <StatCard label="New applications" value={applications.filter((a) => a.status === "Applied").length} icon={FileText} tone="blue" />
        <StatCard label="In interview" value={applications.filter((a) => a.status === "Interview").length} icon={CalendarClock} tone="amber" />
        <StatCard label="Selected" value={applications.filter((a) => a.status === "Selected").length} icon={UserCheck} tone="green" />
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
          <TabsTrigger value="jobs">Job openings ({jobs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search name, qualification, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger className="lg:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All positions</SelectItem>
                  {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
                  <SelectItem value="null">General applications</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">In progress</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  {APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {shown.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No applications.</CardContent></Card>}
          {shown.map((a) => (
            <Card key={a.id} className="gap-0">
              <CardContent className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{a.name}</p>
                    <Badge variant="outline">{jobTitle(a.jobId)}</Badge>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.qualification} · {a.experienceYears} yr{a.experienceYears === 1 ? "" : "s"} experience{a.currentEmployer && a.currentEmployer !== "—" ? ` · ${a.currentEmployer}` : ""}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{a.phone}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{a.email}</span>
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{a.resumeName}</span>
                    <span>Applied {a.appliedOn}</span>
                    {a.expectedSalary && <span>Expects {a.expectedSalary}</span>}
                  </p>
                  {a.coverLetter && <p className="mt-2 text-xs italic text-muted-foreground">“{a.coverLetter}”</p>}
                  <Input className="mt-3 h-8 text-sm" placeholder="HR notes (e.g. good demo class, check references)" defaultValue={a.notes} onBlur={(e) => e.target.value !== a.notes && updateApplication(a.id, { notes: e.target.value })} aria-label={`Notes for ${a.name}`} />
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:w-[340px] xl:justify-end">
                  {a.status === "Interview" && (
                    <Input type="date" className="h-8 w-40" value={a.interviewDate ?? ""} onChange={(e) => updateApplication(a.id, { interviewDate: e.target.value || undefined })} aria-label="Interview date" />
                  )}
                  <Select value={a.status} onValueChange={(v: ApplicationStatus) => setStatus(a.id, v, a.name)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  {a.status === "Selected" && (
                    <Button size="sm" variant="outline" asChild><Link to="/hr/setup/teachers">Add as staff</Link></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4 space-y-3">
          {jobs.map((j) => {
            const count = applications.filter((a) => a.jobId === j.id).length;
            const live = isAcceptingApplications(j);
            return (
              <Card key={j.id} className="gap-0">
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{j.title}</p>
                      <Badge variant="outline">{j.category}</Badge>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${live ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {live ? "Live on website" : j.isOpen ? "Last date passed" : "Closed"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{j.department} · {j.employmentType} · {j.campus} · {j.vacancies} vacanc{j.vacancies === 1 ? "y" : "ies"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Posted {j.postedOn} · Last date {j.lastDate} · {j.salary}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" />{count}</span>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={j.isOpen} onCheckedChange={(v) => { setJobOpen(j.id, v); toast.success(v ? "Job opened" : "Job closed"); }} aria-label="Accepting applications" />Open
                    </label>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDraft({ ...j, responsibilities: j.responsibilities.join("\n") })}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit job" : "Post a job"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>Job title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. PGT Chemistry" /></div>
              <div className="space-y-2"><Label>Department</Label><Input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={draft.category} onValueChange={(v: JobOpening["category"]) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employment type</Label>
                <Select value={draft.employmentType} onValueChange={(v: JobOpening["employmentType"]) => setDraft({ ...draft, employmentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EMPLOYMENT_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campus</Label>
                <Select value={draft.campus} onValueChange={(v) => setDraft({ ...draft, campus: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{site.branches.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Vacancies</Label><Input type="number" min={1} value={draft.vacancies} onChange={(e) => setDraft({ ...draft, vacancies: Math.max(0, Number(e.target.value)) })} /></div>
              <div className="space-y-2"><Label>Last date to apply</Label><Input type="date" value={draft.lastDate} onChange={(e) => setDraft({ ...draft, lastDate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Qualification</Label><Input value={draft.qualification} onChange={(e) => setDraft({ ...draft, qualification: e.target.value })} /></div>
              <div className="space-y-2"><Label>Experience</Label><Input value={draft.experience} onChange={(e) => setDraft({ ...draft, experience: e.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Salary (shown on website)</Label><Input value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} placeholder="₹40,000 – ₹52,000 / month" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Responsibilities (one per line)</Label><Textarea rows={4} value={draft.responsibilities} onChange={(e) => setDraft({ ...draft, responsibilities: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={draft.isOpen} onCheckedChange={(v) => setDraft({ ...draft, isOpen: v })} />Accepting applications (shown on the website)</label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={saveDraft}>{draft?.id ? "Save changes" : "Post job"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
