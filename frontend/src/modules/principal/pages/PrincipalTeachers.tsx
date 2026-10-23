import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Search, Plus, Pencil, Trash2, Eye, Mail, Phone, Users, BookOpen,
  Award, UserCheck, ChevronDown, ChevronUp, X, Check,
  GraduationCap, Briefcase, MapPin, Banknote, Stethoscope,
  Calendar, Hash, Star, School, Crown, Shield, BookMarked,
  FlaskConical, Dumbbell, Music2, Palette, Computer, Library,
  ClipboardList, BadgeCheck, AlertTriangle, Building2,
  User, Home, Heart, ChevronRight, ChevronLeft,
  CheckCircle2, Save, FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

import type { ClassSubjectEntry, EmploymentType, Experience, Qualification, Teacher, TeacherStatus as Status } from "@/types/teacher";
import { useTeachers } from "@/store/teachers";
import { useSectionBase } from "@/lib/section";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_POSITIONS = [
  { value: "Principal",                label: "Principal",                icon: Crown,         color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { value: "Vice Principal",           label: "Vice Principal",           icon: Star,          color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "Head of Department (HOD)", label: "Head of Department (HOD)", icon: Building2,     color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  { value: "Class Teacher",            label: "Class Teacher",            icon: School,        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "Assistant Teacher",        label: "Assistant Teacher",        icon: UserCheck,     color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { value: "Subject Teacher",          label: "Subject Teacher",          icon: BookOpen,      color: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  { value: "Senior Teacher",           label: "Senior Teacher",           icon: BadgeCheck,    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "Lab Incharge",             label: "Lab Incharge",             icon: FlaskConical,  color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { value: "Sports Teacher",           label: "Sports Teacher / Coach",   icon: Dumbbell,      color: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300" },
  { value: "Arts Teacher",             label: "Arts Teacher",             icon: Palette,       color: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "Music Teacher",            label: "Music Teacher",            icon: Music2,        color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  { value: "Computer Teacher",         label: "Computer Teacher",         icon: Computer,      color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { value: "Librarian",                label: "Librarian",                icon: Library,       color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "Counselor",                label: "Counselor / Psychologist", icon: Shield,        color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  { value: "NCC Officer",              label: "NCC Officer",              icon: Award,         color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { value: "NSS Coordinator",          label: "NSS Coordinator",          icon: Users,         color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "Exam Coordinator",         label: "Exam Coordinator",         icon: ClipboardList, color: "bg-slate-100 text-foreground dark:bg-slate-900/40" },
  { value: "Admission Incharge",       label: "Admission Incharge",       icon: BookMarked,    color: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" },
  { value: "Activity Incharge",        label: "Activity / Event Incharge",icon: Star,          color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "Tutor",                    label: "Tutor (Remedial)",         icon: GraduationCap, color: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
];

const ALL_CLASSES   = ["Nursery","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11-Sci","11-Com","11-Arts","12-Sci","12-Com","12-Arts"];
const ALL_SUBJECTS  = ["Mathematics","Physics","Chemistry","Biology","English","Hindi","Bengali","History","Geography","Computer Science","Art","Music","Physical Education","Science","Economics","Accountancy","Business Studies","Political Science","Sociology","Psychology","Sanskrit","French","German"];
const DEPARTMENTS   = ["Mathematics","Science","English","Hindi","Social Science","Computer Science","Physical Education","Arts","Commerce","Biology","Chemistry","Physics","Languages"];
const DESIGNATIONS  = ["PRT (Primary Teacher)","TGT (Trained Graduate Teacher)","PGT (Post Graduate Teacher)","Lecturer","Special Educator","Lab Assistant","Librarian","Counselor"];
const BLOOD_GROUPS  = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const STATUS_OPTIONS: Status[] = ["Active","On Leave","Suspended","Resigned"];
const EMP_TYPES: EmploymentType[] = ["Permanent","Probation","Contract","Part-Time","Guest Faculty"];
const RELIGIONS     = ["Hindu","Muslim","Christian","Sikh","Buddhist","Jain","Other"];
const CATEGORIES    = ["General","OBC","OBC-NCL","SC","ST","EWS"];
const MEDIUMS       = ["Hindi","English","Hindi & English"];
const MARITAL_STATUS= ["Single","Married","Divorced","Widowed"];
const ACCOUNT_TYPES = ["Savings","Current"];
const SALARY_GRADES = ["Grade Pay 2000","Grade Pay 2400","Grade Pay 2800","Grade Pay 4200","Grade Pay 4600","Grade Pay 4800","Grade Pay 5400"];
const TET_LEVELS    = ["Level 1 (Class 1-5)","Level 2 (Class 6-8)","Both"];
const CTET_PAPERS   = ["Paper I (Class 1-5)","Paper II (Class 6-8)","Both"];
const DEGREE_BOARDS = ["University","CBSE","ICSE","State Board","IB","IGCSE","Other"];

const emptyQualification: Qualification = { degree:"", institute:"", board:"", year:"", percentage:"" };
const emptyExpEntry: Experience = { schoolName:"", designation:"", from:"", to:"", reasonLeaving:"" };

const EDIT_STEPS = [
  { id: 1,  label: "Personal",       icon: User          },
  { id: 2,  label: "Professional",   icon: Briefcase     },
  { id: 3,  label: "Address",        icon: Home          },
  { id: 4,  label: "Qualifications", icon: GraduationCap },
  { id: 5,  label: "Experience",     icon: Award         },
  { id: 6,  label: "Family",         icon: Users         },
  { id: 7,  label: "Bank & Salary",  icon: Banknote      },
  { id: 8,  label: "Health",         icon: Stethoscope   },
  { id: 9,  label: "Documents",      icon: FileText      },
  { id: 10, label: "Positions",      icon: Crown         },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(-2).map(n => n[0]).join("").toUpperCase();
}
function getPositionMeta(posVal: string) {
  return ALL_POSITIONS.find(p => p.value === posVal) ?? { value: posVal, label: posVal, icon: Award, color: "bg-muted text-foreground/80" };
}
function statusColor(s: Status) {
  if (s === "Active")    return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (s === "On Leave")  return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
  if (s === "Suspended") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-muted text-foreground/80";
}
const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
];

// ── Reusable Edit Form primitives ─────────────────────────────────────────────

function ELbl({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-foreground/70 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function EInp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500
        transition-colors disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}
function ESel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
    >{children}</select>
  );
}
function ETxta(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} rows={props.rows ?? 3}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500
        transition-colors resize-none"
    />
  );
}
function EChk({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0
          ${checked ? "bg-violet-600 border-violet-600" : "border-border group-hover:border-violet-400"}`}
      >
        {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white stroke-2"><polyline points="1,4 4,7 9,1" /></svg>}
      </div>
      <span className="text-sm text-foreground/80">{label}</span>
    </label>
  );
}
function ESection({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-3 border-b border-border">
      <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-foreground/50 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
function ToggleChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
        ${selected ? "bg-violet-600 border-violet-600 text-white" : "bg-background border-border text-foreground/70 hover:border-violet-400"}`}
    >{label}</button>
  );
}

// ── Edit Step Bar ─────────────────────────────────────────────────────────────

function EditStepBar({ current }: { current: number }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-center gap-1 min-w-max">
        {EDIT_STEPS.map((step, i) => {
          const done   = step.id < current;
          const active = step.id === current;
          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${active ? "bg-violet-600 text-white shadow-sm"
                  : done  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                           : "bg-accent/40 text-foreground/40"}`}
              >
                {done ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <step.icon className="h-3 w-3 shrink-0" />}
                <span className="hidden lg:block">{step.label}</span>
                <span className="lg:hidden">{step.id}</span>
              </div>
              {i < EDIT_STEPS.length - 1 && (
                <div className={`w-2 h-px ${done ? "bg-violet-300 dark:bg-violet-700" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Class-Subject Manager ─────────────────────────────────────────────────────

function ClassSubjectManager({ entries, onChange }: { entries: ClassSubjectEntry[]; onChange: (e: ClassSubjectEntry[]) => void }) {
  const addRow    = () => onChange([...entries, { className: "", subjects: [] }]);
  const removeRow = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const setClass  = (i: number, cls: string) => { const a=[...entries]; a[i]={...a[i],className:cls}; onChange(a); };
  const toggleSub = (i: number, sub: string) => {
    const a=[...entries];
    a[i]={...a[i], subjects: a[i].subjects.includes(sub) ? a[i].subjects.filter(s=>s!==sub) : [...a[i].subjects,sub]};
    onChange(a);
  };
  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="p-3 rounded-xl border border-border bg-accent/20 space-y-3">
          <div className="flex items-center gap-2">
            <ESel value={entry.className} onChange={e => setClass(i, e.target.value)} className="flex-1">
              <option value="">Select Class</option>
              {ALL_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
            </ESel>
            <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 p-1 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {entry.className && (
            <div>
              <p className="text-[11px] text-foreground/50 mb-2 uppercase tracking-wide font-medium">
                Subjects for Class {entry.className} — select multiple
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_SUBJECTS.map(sub => (
                  <ToggleChip key={sub} label={sub} selected={entry.subjects.includes(sub)} onToggle={() => toggleSub(i, sub)} />
                ))}
              </div>
              {entry.subjects.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.subjects.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      <Check className="h-2.5 w-2.5" />{s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
        <Plus className="h-4 w-4" /> Add Class
      </button>
    </div>
  );
}

// ── Full Edit Dialog ───────────────────────────────────────────────────────────
// Uses a fixed overlay that respects sidebar (var --sidebar-width) and topnav (var --topnav-height)
// Falls back to left-offset of 0 if CSS vars are not set, so it still works standalone.

function FullEditDialog({
  teacher, onSave, onClose,
}: {
  teacher: Teacher;
  onSave: (t: Teacher) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Teacher>({ ...teacher });
  const [step,  setStep]  = useState(1);

  const set = (field: keyof Teacher, value: any) => setDraft(p => ({ ...p, [field]: value }));

  const addQual    = () => set("qualifications", [...draft.qualifications, { ...emptyQualification }]);
  const removeQual = (i: number) => set("qualifications", draft.qualifications.filter((_,idx)=>idx!==i));
  const updateQual = (i: number, f: keyof Qualification, v: string) => {
    const a=[...draft.qualifications]; a[i]={...a[i],[f]:v}; set("qualifications",a);
  };
  const addExp    = () => set("experiences", [...draft.experiences, { ...emptyExpEntry }]);
  const removeExp = (i: number) => set("experiences", draft.experiences.filter((_,idx)=>idx!==i));
  const updateExp = (i: number, f: keyof Experience, v: string) => {
    const a=[...draft.experiences]; a[i]={...a[i],[f]:v}; set("experiences",a);
  };
  const togglePos = (val: string) =>
    set("positions", draft.positions.includes(val) ? draft.positions.filter(p=>p!==val) : [...draft.positions, val]);

  const totalGross = [draft.basicSalary, draft.hra, draft.da, draft.ta, draft.otherAllowances]
    .reduce((s,v) => s + (parseFloat(v)||0), 0);

  const renderStepContent = () => {
    switch (step) {
      case 1: return (
        <div className="space-y-5">
          <ESection icon={User} title="Personal Information" subtitle="Basic personal details" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><ELbl required>First Name</ELbl><EInp value={draft.name.split(" ")[0] ?? ""} onChange={e => {
              const parts = draft.name.split(" "); parts[0] = e.target.value; set("name", parts.join(" ").trim());
            }} /></div>
            <div><ELbl>Middle Name</ELbl><EInp placeholder="(optional)" onChange={() => {}} /></div>
            <div><ELbl required>Last Name</ELbl><EInp value={draft.name.split(" ").slice(1).join(" ")} onChange={e => {
              const first = draft.name.split(" ")[0] ?? ""; set("name", `${first} ${e.target.value}`.trim());
            }} /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><ELbl>Date of Birth</ELbl><EInp type="date" value={draft.dob} onChange={e=>set("dob",e.target.value)} /></div>
            <div><ELbl>Gender</ELbl>
              <ESel value={draft.gender} onChange={e=>set("gender",e.target.value)}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </ESel>
            </div>
            <div><ELbl>Blood Group</ELbl>
              <ESel value={draft.bloodGroup} onChange={e=>set("bloodGroup",e.target.value)}>
                <option value="">Select</option>{BLOOD_GROUPS.map(b=><option key={b}>{b}</option>)}
              </ESel>
            </div>
            <div><ELbl>Marital Status</ELbl>
              <ESel value={draft.maritalStatus} onChange={e=>set("maritalStatus",e.target.value)}>
                <option value="">Select</option>{MARITAL_STATUS.map(m=><option key={m}>{m}</option>)}
              </ESel>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><ELbl>Nationality</ELbl><EInp value={draft.nationality} onChange={e=>set("nationality",e.target.value)} /></div>
            <div><ELbl>Religion</ELbl>
              <ESel value={draft.religion} onChange={e=>set("religion",e.target.value)}>
                <option value="">Select</option>{RELIGIONS.map(r=><option key={r}>{r}</option>)}
              </ESel>
            </div>
            <div><ELbl>Category</ELbl>
              <ESel value={draft.category} onChange={e=>set("category",e.target.value)}>
                <option value="">Select</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </ESel>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <ELbl required>Mobile</ELbl>
              <div className="flex">
                <span className="flex items-center px-3 bg-accent border border-r-0 border-border rounded-l-lg text-sm text-foreground/60">+91</span>
                <EInp value={draft.phone} onChange={e=>set("phone",e.target.value)} className="rounded-l-none" />
              </div>
            </div>
            <div>
              <ELbl>Alternate Phone</ELbl>
              <div className="flex">
                <span className="flex items-center px-3 bg-accent border border-r-0 border-border rounded-l-lg text-sm text-foreground/60">+91</span>
                <EInp value={draft.alternatePhone} onChange={e=>set("alternatePhone",e.target.value)} className="rounded-l-none" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><ELbl required>School Email</ELbl><EInp type="email" value={draft.email} onChange={e=>set("email",e.target.value)} /></div>
            <div><ELbl>Personal Email</ELbl><EInp type="email" value={draft.personalEmail} onChange={e=>set("personalEmail",e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><ELbl required>Aadhar No.</ELbl><EInp value={draft.aadhar} onChange={e=>set("aadhar",e.target.value)} /></div>
            <div><ELbl required>PAN No.</ELbl><EInp value={draft.pan} onChange={e=>set("pan",e.target.value.toUpperCase())} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><ELbl>Employee ID</ELbl><EInp value={draft.empId} onChange={e=>set("empId",e.target.value)} /></div>
            <div><ELbl>Status</ELbl>
              <ESel value={draft.status} onChange={e=>set("status",e.target.value as Status)}>
                {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
              </ESel>
            </div>
          </div>
        </div>
      );

      case 2: return (
        <div className="space-y-5">
          <ESection icon={Briefcase} title="Professional Details" subtitle="Designation, department, joining info" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><ELbl required>Designation</ELbl>
              <ESel value={draft.designation} onChange={e=>set("designation",e.target.value)}>
                <option value="">Select</option>{DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
              </ESel>
            </div>
            <div><ELbl required>Department</ELbl>
              <ESel value={draft.department} onChange={e=>set("department",e.target.value)}>
                <option value="">Select</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
              </ESel>
            </div>
            <div><ELbl>Reporting To</ELbl><EInp value={draft.reportingTo} onChange={e=>set("reportingTo",e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><ELbl required>Joining Date</ELbl><EInp type="date" value={draft.joiningDate} onChange={e=>set("joiningDate",e.target.value)} /></div>
            <div><ELbl required>Employment Type</ELbl>
              <ESel value={draft.employmentType} onChange={e=>set("employmentType",e.target.value as EmploymentType)}>
                {EMP_TYPES.map(e=><option key={e}>{e}</option>)}
              </ESel>
            </div>
            <div><ELbl>Academic Year</ELbl>
              <ESel value={draft.academicYear} onChange={e=>set("academicYear",e.target.value)}>
                <option>2025-26</option><option>2026-27</option>
              </ESel>
            </div>
            <div><ELbl>Medium</ELbl>
              <ESel value={draft.medium} onChange={e=>set("medium",e.target.value)}>
                <option value="">Select</option>{MEDIUMS.map(m=><option key={m}>{m}</option>)}
              </ESel>
            </div>
          </div>
          <div><ELbl>Total Experience</ELbl><EInp value={draft.experience} onChange={e=>set("experience",e.target.value)} placeholder="e.g. 8 years" /></div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground mb-1">Class & Subject Assignments</p>
            <p className="text-xs text-foreground/50 mb-4">A teacher can teach multiple subjects in the same or different classes.</p>
            <ClassSubjectManager entries={draft.classSubjects} onChange={v=>set("classSubjects",v)} />
          </div>
        </div>
      );

      case 3: return (
        <div className="space-y-5">
          <ESection icon={Home} title="Address Details" />
          <div><ELbl required>Present Address</ELbl><ETxta value={draft.address} onChange={e=>set("address",e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div><ELbl>City</ELbl><EInp value={draft.city} onChange={e=>set("city",e.target.value)} /></div>
            <div><ELbl>State</ELbl><EInp value={draft.state} onChange={e=>set("state",e.target.value)} /></div>
            <div><ELbl>PIN Code</ELbl><EInp maxLength={6} value={draft.pincode} onChange={e=>set("pincode",e.target.value)} /></div>
          </div>
          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-sm font-semibold text-foreground">Permanent Address</p>
            <div><ELbl>Address</ELbl><ETxta value={draft.permanentAddress} onChange={e=>set("permanentAddress",e.target.value)} /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><ELbl>City</ELbl><EInp value={draft.permanentCity} onChange={e=>set("permanentCity",e.target.value)} /></div>
              <div><ELbl>State</ELbl><EInp value={draft.permanentState} onChange={e=>set("permanentState",e.target.value)} /></div>
              <div><ELbl>PIN Code</ELbl><EInp maxLength={6} value={draft.permanentPincode} onChange={e=>set("permanentPincode",e.target.value)} /></div>
            </div>
          </div>
        </div>
      );

      case 4: return (
        <div className="space-y-5">
          <ESection icon={GraduationCap} title="Academic Qualifications" subtitle="Degrees, B.Ed, TET, CTET" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Academic Degrees</p>
              <button onClick={addQual} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
                <Plus className="h-4 w-4" /> Add Degree
              </button>
            </div>
            <div className="space-y-3">
              {draft.qualifications.map((q,i) => (
                <div key={i} className="p-3 rounded-xl border border-border bg-accent/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Qualification {i+1}</span>
                    {draft.qualifications.length > 1 && (
                      <button onClick={()=>removeQual(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div><ELbl>Degree</ELbl><EInp placeholder="B.Sc / M.A" value={q.degree} onChange={e=>updateQual(i,"degree",e.target.value)} /></div>
                    <div className="sm:col-span-2"><ELbl>Institute</ELbl><EInp placeholder="University name" value={q.institute} onChange={e=>updateQual(i,"institute",e.target.value)} /></div>
                    <div><ELbl>Board</ELbl>
                      <ESel value={q.board} onChange={e=>updateQual(i,"board",e.target.value)}>
                        <option value="">Select</option>{DEGREE_BOARDS.map(b=><option key={b}>{b}</option>)}
                      </ESel>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><ELbl>Year</ELbl><EInp maxLength={4} placeholder="2018" value={q.year} onChange={e=>updateQual(i,"year",e.target.value)} /></div>
                      <div><ELbl>%</ELbl><EInp placeholder="75" value={q.percentage} onChange={e=>updateQual(i,"percentage",e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">B.Ed / D.El.Ed</p>
              <EChk checked={draft.bEd} onChange={v=>set("bEd",v)} label="Has B.Ed / D.El.Ed" />
            </div>
            {draft.bEd && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><ELbl>Institute</ELbl><EInp value={draft.bEdInstitute} onChange={e=>set("bEdInstitute",e.target.value)} /></div>
                <div><ELbl>Passing Year</ELbl><EInp maxLength={4} value={draft.bEdYear} onChange={e=>set("bEdYear",e.target.value)} /></div>
                <div><ELbl>Percentage</ELbl><EInp value={draft.bEdPercent} onChange={e=>set("bEdPercent",e.target.value)} /></div>
              </div>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">TET (State)</p>
              <EChk checked={draft.tet} onChange={v=>set("tet",v)} label="Has TET" />
            </div>
            {draft.tet && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><ELbl>Level</ELbl>
                  <ESel value={draft.tetLevel} onChange={e=>set("tetLevel",e.target.value)}>
                    <option value="">Select</option>{TET_LEVELS.map(t=><option key={t}>{t}</option>)}
                  </ESel>
                </div>
                <div><ELbl>Score</ELbl><EInp value={draft.tetScore} onChange={e=>set("tetScore",e.target.value)} /></div>
                <div><ELbl>Year</ELbl><EInp maxLength={4} value={draft.tetYear} onChange={e=>set("tetYear",e.target.value)} /></div>
              </div>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">CTET (Central)</p>
              <EChk checked={draft.ctet} onChange={v=>set("ctet",v)} label="Has CTET" />
            </div>
            {draft.ctet && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><ELbl>Paper</ELbl>
                  <ESel value={draft.ctetPaper} onChange={e=>set("ctetPaper",e.target.value)}>
                    <option value="">Select</option>{CTET_PAPERS.map(p=><option key={p}>{p}</option>)}
                  </ESel>
                </div>
                <div><ELbl>Score</ELbl><EInp value={draft.ctetScore} onChange={e=>set("ctetScore",e.target.value)} /></div>
                <div><ELbl>Year</ELbl><EInp maxLength={4} value={draft.ctetYear} onChange={e=>set("ctetYear",e.target.value)} /></div>
              </div>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <ELbl>Other Certifications</ELbl>
            <ETxta value={draft.otherCerts} onChange={e=>set("otherCerts",e.target.value)} placeholder="NET, SET, NTT, online courses, national awards..." />
          </div>
        </div>
      );

      case 5: return (
        <div className="space-y-5">
          <ESection icon={Award} title="Work Experience" subtitle="Previous employment history" />
          <div><ELbl>Total Experience</ELbl><EInp value={draft.totalExperience} onChange={e=>set("totalExperience",e.target.value)} placeholder="e.g. 5 years 3 months" /></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Previous Employment</p>
              <button onClick={addExp} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {draft.experiences.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-border rounded-xl text-foreground/40 text-sm">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No previous experience added.
              </div>
            )}
            <div className="space-y-3">
              {draft.experiences.map((exp,i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-accent/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground/50 uppercase">Experience {i+1}</span>
                    <button onClick={()=>removeExp(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><ELbl>School / Institution</ELbl><EInp value={exp.schoolName} onChange={e=>updateExp(i,"schoolName",e.target.value)} /></div>
                    <div><ELbl>Designation Held</ELbl><EInp value={exp.designation} onChange={e=>updateExp(i,"designation",e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div><ELbl>From</ELbl><EInp type="date" value={exp.from} onChange={e=>updateExp(i,"from",e.target.value)} /></div>
                    <div><ELbl>To</ELbl><EInp type="date" value={exp.to} onChange={e=>updateExp(i,"to",e.target.value)} /></div>
                    <div><ELbl>Reason for Leaving</ELbl><EInp value={exp.reasonLeaving} onChange={e=>updateExp(i,"reasonLeaving",e.target.value)} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

      case 6: return (
        <div className="space-y-5">
          <ESection icon={Users} title="Family Details" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><ELbl>Father's Name</ELbl><EInp value={draft.fatherName} onChange={e=>set("fatherName",e.target.value)} /></div>
            <div><ELbl>Occupation</ELbl><EInp value={draft.fatherOccupation} onChange={e=>set("fatherOccupation",e.target.value)} /></div>
            <div><ELbl>Phone</ELbl><EInp value={draft.fatherPhone} onChange={e=>set("fatherPhone",e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
            <div><ELbl>Mother's Name</ELbl><EInp value={draft.motherName} onChange={e=>set("motherName",e.target.value)} /></div>
            <div><ELbl>Occupation</ELbl><EInp value={draft.motherOccupation} onChange={e=>set("motherOccupation",e.target.value)} /></div>
          </div>
          {draft.maritalStatus === "Married" && (
            <div className="border-t border-border pt-4 space-y-4">
              <p className="text-sm font-semibold text-foreground">Spouse Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><ELbl>Spouse Name</ELbl><EInp value={draft.spouseName} onChange={e=>set("spouseName",e.target.value)} /></div>
                <div><ELbl>Occupation</ELbl><EInp value={draft.spouseOccupation} onChange={e=>set("spouseOccupation",e.target.value)} /></div>
                <div><ELbl>Phone</ELbl><EInp value={draft.spousePhone} onChange={e=>set("spousePhone",e.target.value)} /></div>
              </div>
              <div>
                <ELbl>Number of Children</ELbl>
                <ESel value={draft.children} onChange={e=>set("children",e.target.value)} style={{width:"auto",minWidth:"150px"}}>
                  {["0","1","2","3","4+"].map(n=><option key={n}>{n}</option>)}
                </ESel>
              </div>
            </div>
          )}
          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-sm font-semibold text-foreground">Emergency Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><ELbl required>Name</ELbl><EInp value={draft.emergencyContact} onChange={e=>set("emergencyContact",e.target.value)} /></div>
              <div><ELbl required>Relation</ELbl><EInp value={draft.emergencyRelation} onChange={e=>set("emergencyRelation",e.target.value)} /></div>
              <div><ELbl required>Phone</ELbl><EInp value={draft.emergencyPhone} onChange={e=>set("emergencyPhone",e.target.value)} /></div>
            </div>
          </div>
        </div>
      );

      case 7: return (
        <div className="space-y-5">
          <ESection icon={Banknote} title="Bank & Salary Details" subtitle="Account info and salary structure" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><ELbl required>Bank Name</ELbl><EInp value={draft.bankName} onChange={e=>set("bankName",e.target.value)} /></div>
            <div><ELbl required>Account Number</ELbl><EInp value={draft.accountNo} onChange={e=>set("accountNo",e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><ELbl required>IFSC Code</ELbl><EInp value={draft.ifscCode} onChange={e=>set("ifscCode",e.target.value.toUpperCase())} /></div>
            <div><ELbl>Branch Name</ELbl><EInp value={draft.branchName} onChange={e=>set("branchName",e.target.value)} /></div>
            <div><ELbl>Account Type</ELbl>
              <ESel value={draft.accountType} onChange={e=>set("accountType",e.target.value)}>
                {ACCOUNT_TYPES.map(a=><option key={a}>{a}</option>)}
              </ESel>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground mb-4">Salary Structure</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><ELbl>Salary Grade</ELbl>
                <ESel value={draft.salaryGrade} onChange={e=>set("salaryGrade",e.target.value)}>
                  <option value="">Select Grade</option>{SALARY_GRADES.map(g=><option key={g}>{g}</option>)}
                </ESel>
              </div>
              <div><ELbl>Basic Salary (₹)</ELbl><EInp type="number" value={draft.basicSalary} onChange={e=>set("basicSalary",e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div><ELbl>HRA (₹)</ELbl><EInp type="number" value={draft.hra} onChange={e=>set("hra",e.target.value)} /></div>
              <div><ELbl>DA (₹)</ELbl><EInp type="number" value={draft.da} onChange={e=>set("da",e.target.value)} /></div>
              <div><ELbl>TA (₹)</ELbl><EInp type="number" value={draft.ta} onChange={e=>set("ta",e.target.value)} /></div>
              <div><ELbl>Other (₹)</ELbl><EInp type="number" value={draft.otherAllowances} onChange={e=>set("otherAllowances",e.target.value)} /></div>
            </div>
            {totalGross > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-sm">
                <p className="text-violet-700 dark:text-violet-300 font-semibold">
                  Gross Monthly: ₹{totalGross.toLocaleString("en-IN")}
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground mb-4">PF / ESI / GPF</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><ELbl>PF No.</ELbl><EInp value={draft.pfNo} onChange={e=>set("pfNo",e.target.value)} /></div>
              <div><ELbl>ESI No.</ELbl><EInp value={draft.esiNo} onChange={e=>set("esiNo",e.target.value)} /></div>
              <div><ELbl>GPF No.</ELbl><EInp value={draft.gpfNo} onChange={e=>set("gpfNo",e.target.value)} /></div>
            </div>
          </div>
        </div>
      );

      case 8: return (
        <div className="space-y-5">
          <ESection icon={Stethoscope} title="Health Information" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><ELbl>Height (cm)</ELbl><EInp type="number" value={draft.height} onChange={e=>set("height",e.target.value)} /></div>
            <div><ELbl>Weight (kg)</ELbl><EInp type="number" value={draft.weight} onChange={e=>set("weight",e.target.value)} /></div>
            <div><ELbl>Doctor Name</ELbl><EInp value={draft.doctorName} onChange={e=>set("doctorName",e.target.value)} /></div>
            <div><ELbl>Doctor Phone</ELbl><EInp value={draft.doctorPhone} onChange={e=>set("doctorPhone",e.target.value)} /></div>
          </div>
          <div><ELbl>Medical Conditions</ELbl><ETxta value={draft.medicalCondition} onChange={e=>set("medicalCondition",e.target.value)} placeholder="Leave blank if none" /></div>
          <div><ELbl>Known Allergies</ELbl><ETxta value={draft.allergies} onChange={e=>set("allergies",e.target.value)} placeholder="Leave blank if none" /></div>
          <div className="border-t border-border pt-4">
            <EChk checked={draft.physicallyHandicapped} onChange={v=>set("physicallyHandicapped",v)} label="Person with Disability (PwD)" />
            {draft.physicallyHandicapped && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div><ELbl>Type of Disability</ELbl><EInp value={draft.handicapType} onChange={e=>set("handicapType",e.target.value)} /></div>
                <div><ELbl>Disability %</ELbl><EInp type="number" min="0" max="100" value={draft.handicapPercent} onChange={e=>set("handicapPercent",e.target.value)} /></div>
              </div>
            )}
          </div>
          <div><ELbl>Special Requirements</ELbl><ETxta value={draft.specialNeeds} onChange={e=>set("specialNeeds",e.target.value)} placeholder="Wheelchair access etc." /></div>
        </div>
      );

      case 9: return (
        <div className="space-y-5">
          <ESection icon={FileText} title="Documents Submitted" subtitle="Mark documents received at the time of joining" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["docAadhar",           "Aadhar Card (Self-attested)"],
              ["docPan",              "PAN Card"],
              ["docDegree",           "Degree / Marksheet Certificates"],
              ["docBEd",              "B.Ed / D.El.Ed Certificate"],
              ["docTET",              "TET / CTET Certificate"],
              ["docExperience",       "Experience Certificate(s)"],
              ["docCaste",            "Caste / Category Certificate"],
              ["docResidence",        "Residence / Address Proof"],
              ["docPassport",         "Passport Size Photographs (4 copies)"],
              ["docMedical",          "Medical / Fitness Certificate"],
              ["docPoliceVerification","Police Verification Certificate"],
            ] as [keyof Teacher, string][]).map(([f, label]) => (
              <EChk key={f} checked={draft[f] as boolean} onChange={v=>set(f,v)} label={label} />
            ))}
          </div>
        </div>
      );

      case 10: return (
        <div className="space-y-5">
          <ESection icon={Crown} title="Positions & Roles" subtitle="Assign or remove positions for this teacher" />
          <p className="text-xs text-foreground/60">Click a position to assign / remove it:</p>
          <div className="flex flex-wrap gap-2">
            {ALL_POSITIONS.map(pos => {
              const selected = draft.positions.includes(pos.value);
              return (
                <button key={pos.value} type="button" onClick={() => togglePos(pos.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all
                    ${selected ? "border-violet-500 bg-violet-600 text-white" : "border-border bg-background text-foreground/70 hover:border-violet-400"}`}
                >
                  <pos.icon className="h-3 w-3" />
                  {pos.label}
                  {selected && <X className="h-2.5 w-2.5 ml-0.5" />}
                </button>
              );
            })}
          </div>
          {draft.positions.includes("Class Teacher") && (
            <div>
              <ELbl>Class Teacher of</ELbl>
              <ESel value={draft.classTeacherOf} onChange={e=>set("classTeacherOf",e.target.value)}>
                <option value="">Select class</option>
                {ALL_CLASSES.map(c=><option key={c} value={c}>Class {c}</option>)}
              </ESel>
            </div>
          )}
          {draft.positions.length > 0 && (
            <div>
              <p className="text-xs text-foreground/50 uppercase tracking-wide font-medium mb-2">Currently assigned</p>
              <div className="flex flex-wrap gap-2">
                {draft.positions.map(pos => {
                  const meta = getPositionMeta(pos);
                  return (
                    <span key={pos} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
                      <meta.icon className="h-3 w-3" />
                      {pos === "Class Teacher" && draft.classTeacherOf ? `CT – ${draft.classTeacherOf}` : meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  const progressPct = Math.round(((step - 1) / (EDIT_STEPS.length - 1)) * 100);

  // ── KEY FIX: Overlay that leaves sidebar + topnav visible.
  // We position the backdrop to only cover the main content area by reading
  // CSS custom properties --sidebar-width and --topnav-height that the app
  // layout should expose. If they're not set we fall back to safe defaults.
  return (
    <div
      className="fixed inset-0 z-40"
      style={{
        // Backdrop covers the full screen behind the panel
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel: offset from top (topnav) and left (sidebar) via CSS vars with sensible fallbacks */}
      <div
        className="absolute bg-background text-foreground flex flex-col border-l border-border shadow-2xl"
        style={{
          top: "var(--topnav-height, 56px)",
          left: "var(--sidebar-width, 240px)",
          right: 0,
          bottom: 0,
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <Pencil className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-foreground leading-tight truncate">
                Edit — <span className="text-violet-600">{teacher.name}</span>
              </h2>
              <p className="text-xs text-foreground/40 leading-tight">{teacher.empId} • {teacher.designation}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-foreground/50 hover:text-foreground shrink-0 ml-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step bar + progress ── */}
        <div className="px-5 py-3 border-b border-border shrink-0 space-y-2">
          <EditStepBar current={step} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-accent overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] text-foreground/40 shrink-0 tabular-nums">{step}/{EDIT_STEPS.length}</span>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
          {renderStepContent()}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border shrink-0 bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(p => Math.max(1, p - 1))}
            disabled={step === 1}
            className="gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          {step < EDIT_STEPS.length && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(p => Math.min(EDIT_STEPS.length, p + 1))}
              className="gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            onClick={() => { onSave({ ...draft, initials: getInitials(draft.name) }); }}
          >
            <Save className="h-3.5 w-3.5" /> Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub Components ─────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-foreground/50" />
      </div>
      <div>
        <p className="text-[11px] text-foreground/50 uppercase tracking-wide font-medium">{label}</p>
        <div className="text-sm text-foreground font-medium mt-0.5">{value || "—"}</div>
      </div>
    </div>
  );
}
function SectionHead({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
        <Icon className="h-4 w-4 text-violet-600" />
      </div>
      <h4 className="font-semibold text-sm text-foreground">{title}</h4>
    </div>
  );
}

// ── Teacher Detail Sheet ───────────────────────────────────────────────────────

function TeacherDetailSheet({ teacher, onClose, onEdit }: { teacher: Teacher; onClose: () => void; onEdit: () => void }) {
  const [activeTab, setActiveTab] = useState<"overview"|"professional"|"classes"|"bank"|"health">("overview");
  const tabs = [
    { id: "overview",     label: "Overview",     icon: User        },
    { id: "professional", label: "Professional", icon: Briefcase   },
    { id: "classes",      label: "Classes",      icon: School      },
    { id: "bank",         label: "Salary",       icon: Banknote    },
    { id: "health",       label: "Health",       icon: Stethoscope },
  ] as const;

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Teacher Profile</DialogTitle></DialogHeader>

      <div className="flex items-center gap-5 p-5 rounded-xl bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 border border-violet-100 dark:border-violet-800 mb-2">
        <Avatar className="h-20 w-20 shrink-0">
          <AvatarFallback className={`text-2xl font-bold ${AVATAR_COLORS[teacher.id % AVATAR_COLORS.length]}`}>{teacher.initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground">{teacher.name}</h2>
          <p className="text-sm text-foreground/60 mt-0.5">{teacher.designation} • {teacher.department}</p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Badge className={statusColor(teacher.status)}>{teacher.status}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{teacher.empId}</Badge>
            <Badge variant="outline" className="text-xs">{teacher.employmentType}</Badge>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
      </div>

      {teacher.positions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-foreground/50 uppercase tracking-wide font-medium mb-2">Positions</p>
          <div className="flex flex-wrap gap-2">
            {teacher.positions.map(pos => {
              const meta = getPositionMeta(pos);
              return (
                <span key={pos} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
                  <meta.icon className="h-3 w-3" />
                  {pos === "Class Teacher" && teacher.classTeacherOf ? `CT – ${teacher.classTeacherOf}` : meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-border mb-5 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${activeTab === tab.id ? "border-violet-600 text-violet-600" : "border-transparent text-foreground/50 hover:text-foreground"}`}
          >
            <tab.icon className="h-3.5 w-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <InfoRow icon={Users}    label="Full Name"       value={teacher.name} />
          <InfoRow icon={Hash}     label="Employee ID"     value={teacher.empId} />
          <InfoRow icon={Calendar} label="Date of Birth"   value={teacher.dob} />
          <InfoRow icon={Users}    label="Gender"          value={teacher.gender} />
          <InfoRow icon={Phone}    label="Mobile"          value={teacher.phone} />
          <InfoRow icon={Phone}    label="Alternate Phone" value={teacher.alternatePhone} />
          <InfoRow icon={Mail}     label="School Email"    value={teacher.email} />
          <InfoRow icon={Mail}     label="Personal Email"  value={teacher.personalEmail} />
          <InfoRow icon={Award}    label="Blood Group"     value={teacher.bloodGroup} />
          <InfoRow icon={Users}    label="Religion / Cat." value={`${teacher.religion} / ${teacher.category}`} />
          <InfoRow icon={Heart}    label="Marital Status"  value={teacher.maritalStatus} />
          <InfoRow icon={Shield}   label="Aadhar / PAN"    value={`${teacher.aadhar}  •  ${teacher.pan}`} />
          <div className="sm:col-span-2">
            <InfoRow icon={MapPin} label="Present Address"  value={`${teacher.address}, ${teacher.city}, ${teacher.state} - ${teacher.pincode}`} />
          </div>
          <div className="sm:col-span-2">
            <InfoRow icon={MapPin} label="Permanent Address" value={`${teacher.permanentAddress}, ${teacher.permanentCity}, ${teacher.permanentState} - ${teacher.permanentPincode}`} />
          </div>
        </div>
      )}

      {activeTab === "professional" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoRow icon={Briefcase}  label="Designation"     value={teacher.designation} />
            <InfoRow icon={Building2}  label="Department"      value={teacher.department} />
            <InfoRow icon={Calendar}   label="Joining Date"    value={teacher.joiningDate} />
            <InfoRow icon={BadgeCheck} label="Employment Type" value={teacher.employmentType} />
            <InfoRow icon={Award}      label="Experience"      value={teacher.experience} />
            <InfoRow icon={Users}      label="Reporting To"    value={teacher.reportingTo} />
          </div>
          <div className="border-t border-border pt-5">
            <SectionHead icon={GraduationCap} title="Qualifications" />
            <div className="space-y-3">
              {teacher.qualifications.filter(q=>q.degree).map((q,i) => (
                <div key={i} className="p-3 rounded-lg border border-border bg-accent/20 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="font-semibold text-foreground">{q.degree}</span>
                  <span className="text-foreground/70">{q.institute}</span>
                  <span className="text-foreground/50">{q.year}</span>
                  <span className="text-foreground/50">{q.percentage}%</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {teacher.bEd  && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">B.Ed ✓ {teacher.bEdYear && `(${teacher.bEdYear})`}</Badge>}
              {teacher.tet  && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">TET ✓ {teacher.tetScore && `– Score: ${teacher.tetScore}`}</Badge>}
              {teacher.ctet && <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">CTET ✓ {teacher.ctetScore && `– Score: ${teacher.ctetScore}`}</Badge>}
            </div>
            {teacher.otherCerts && <p className="text-sm text-foreground/70 mt-2"><span className="font-medium">Other:</span> {teacher.otherCerts}</p>}
          </div>
          {teacher.experiences.length > 0 && (
            <div className="border-t border-border pt-5">
              <SectionHead icon={Award} title="Previous Experience" />
              <div className="space-y-2">
                {teacher.experiences.map((exp,i) => (
                  <div key={i} className="p-3 rounded-lg border border-border bg-accent/20 text-sm">
                    <p className="font-semibold text-foreground">{exp.schoolName} — {exp.designation}</p>
                    <p className="text-foreground/60 text-xs mt-0.5">{exp.from} to {exp.to}{exp.reasonLeaving && ` • Left: ${exp.reasonLeaving}`}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "classes" && (
        <div className="space-y-4">
          {teacher.classTeacherOf && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <School className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Class Teacher of</p>
                <p className="text-base font-bold text-blue-800 dark:text-blue-200 mt-0.5">Class {teacher.classTeacherOf}</p>
              </div>
            </div>
          )}
          {teacher.classSubjects.length === 0
            ? <div className="text-center py-10 text-foreground/40 text-sm">No class-subject assignments recorded.</div>
            : (
              <div className="space-y-3">
                {teacher.classSubjects.map((cs,i) => (
                  <div key={i} className="p-4 rounded-xl border border-border bg-accent/20">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <School className="h-4 w-4 text-violet-600" />
                      </div>
                      <span className="font-semibold text-foreground">Class {cs.className}</span>
                      {teacher.classTeacherOf === cs.className && (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs ml-1">Class Teacher</Badge>
                      )}
                      <span className="ml-auto text-xs text-foreground/50">{cs.subjects.length} subject{cs.subjects.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cs.subjects.map(sub => (
                        <span key={sub} className="px-3 py-1 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {activeTab === "bank" && (
        <div className="space-y-5">
          <SectionHead icon={Banknote} title="Bank Account Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoRow icon={Building2} label="Bank Name"    value={teacher.bankName} />
            <InfoRow icon={Hash}      label="Account No." value={teacher.accountNo} />
            <InfoRow icon={Hash}      label="IFSC Code"   value={teacher.ifscCode} />
            <InfoRow icon={Hash}      label="Branch"      value={teacher.branchName} />
            <InfoRow icon={Banknote}  label="Basic Salary" value={`₹${Number(teacher.basicSalary).toLocaleString("en-IN")}/month`} />
            <InfoRow icon={Banknote}  label="Salary Grade" value={teacher.salaryGrade} />
          </div>
          {(teacher.hra || teacher.da || teacher.ta) && (
            <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
              <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-2">Allowances</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[["HRA", teacher.hra],["DA", teacher.da],["TA", teacher.ta],["Other", teacher.otherAllowances]].map(([k,v]) => v ? (
                  <div key={k}><span className="text-foreground/50">{k}: </span><span className="font-medium">₹{Number(v).toLocaleString("en-IN")}</span></div>
                ) : null)}
              </div>
              <p className="mt-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                Gross: ₹{[teacher.basicSalary,teacher.hra,teacher.da,teacher.ta,teacher.otherAllowances].reduce((s,v)=>s+(parseFloat(v)||0),0).toLocaleString("en-IN")}/month
              </p>
            </div>
          )}
          {(teacher.pfNo || teacher.esiNo || teacher.gpfNo) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-border pt-4">
              <InfoRow icon={Shield} label="PF No."  value={teacher.pfNo} />
              <InfoRow icon={Shield} label="ESI No." value={teacher.esiNo} />
              <InfoRow icon={Shield} label="GPF No." value={teacher.gpfNo} />
            </div>
          )}
        </div>
      )}

      {activeTab === "health" && (
        <div className="space-y-5">
          <SectionHead icon={Stethoscope} title="Health Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoRow icon={Award}         label="Blood Group"        value={teacher.bloodGroupHealth} />
            <InfoRow icon={Users}         label="Height / Weight"    value={teacher.height && teacher.weight ? `${teacher.height} cm / ${teacher.weight} kg` : "—"} />
            <InfoRow icon={Stethoscope}   label="Medical Conditions" value={teacher.medicalCondition || "None"} />
            <InfoRow icon={AlertTriangle} label="Allergies"          value={teacher.allergies || "None"} />
          </div>
          {teacher.physicallyHandicapped && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Person with Disability (PwD)</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{teacher.handicapType} — {teacher.handicapPercent}%</p>
            </div>
          )}
          {teacher.doctorName && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-border pt-4">
              <InfoRow icon={Phone} label="Family Doctor" value={teacher.doctorName} />
              <InfoRow icon={Phone} label="Doctor Phone"  value={teacher.doctorPhone} />
            </div>
          )}
          <div className="border-t border-border pt-5">
            <SectionHead icon={FileText} title="Documents Status" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                ["docAadhar","Aadhar"],["docPan","PAN"],["docDegree","Degree"],
                ["docBEd","B.Ed"],["docTET","TET"],["docExperience","Experience Cert."],
                ["docCaste","Caste"],["docResidence","Residence"],["docPassport","Photographs"],
                ["docMedical","Medical"],["docPoliceVerification","Police Verification"],
              ] as [keyof Teacher, string][]).map(([f,label]) => (
                <div key={f} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border
                  ${teacher[f] ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                               : "bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"}`}>
                  {teacher[f] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PrincipalTeachers() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const { teachers, updateTeacher, removeTeacher } = useTeachers();
  const [searchQuery,    setSearchQuery]    = useState("");
  const [filterDept,     setFilterDept]     = useState("All");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterPosition, setFilterPosition] = useState("All");
  const [viewTeacher,    setViewTeacher]    = useState<Teacher | null>(null);
  const [editTeacher,    setEditTeacher]    = useState<Teacher | null>(null);
  const [deleteTeacher,  setDeleteTeacher]  = useState<Teacher | null>(null);
  const [expandedId,     setExpandedId]     = useState<number | null>(null);

  const filtered = teachers.filter(t => {
    const q = searchQuery.toLowerCase();
    const matchSearch  = t.name.toLowerCase().includes(q) || t.empId.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
    const matchDept    = filterDept     === "All" || t.department === filterDept;
    const matchStatus  = filterStatus   === "All" || t.status     === filterStatus;
    const matchPos     = filterPosition === "All" || t.positions.includes(filterPosition);
    return matchSearch && matchDept && matchStatus && matchPos;
  });

  const stats = {
    total:         teachers.length,
    active:        teachers.filter(t => t.status === "Active").length,
    onLeave:       teachers.filter(t => t.status === "On Leave").length,
    depts:         new Set(teachers.map(t => t.department)).size,
    classTeachers: teachers.filter(t => t.positions.includes("Class Teacher")).length,
    hods:          teachers.filter(t => t.positions.includes("Head of Department (HOD)")).length,
  };

  const handleSaveEdit = (updated: Teacher) => {
    updateTeacher(updated);
    setEditTeacher(null);
    toast.success("Teacher profile updated successfully!");
  };

  const handleDelete = () => {
    if (!deleteTeacher) return;
    removeTeacher(deleteTeacher.id);
    setDeleteTeacher(null);
    toast.success(`${deleteTeacher.name} removed.`);
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Teachers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all teaching staff, positions & class assignments</p>
        </div>
        <Button className="bg-violet-600 hover:bg-violet-700 shrink-0" onClick={() => navigate(`${base}/setup/teachers`)}>
          <Plus className="h-4 w-4 mr-2" /> Add Teacher
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label:"Total",          value:stats.total,         icon:Users,        color:"text-foreground"  },
          { label:"Active",         value:stats.active,        icon:UserCheck,    color:"text-green-600"   },
          { label:"On Leave",       value:stats.onLeave,       icon:AlertTriangle,color:"text-orange-500"  },
          { label:"Departments",    value:stats.depts,         icon:Building2,    color:"text-blue-600"    },
          { label:"Class Teachers", value:stats.classTeachers, icon:School,       color:"text-violet-600"  },
          { label:"HODs",           value:stats.hods,          icon:Crown,        color:"text-amber-600"   },
        ].map(s => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <s.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${s.color} opacity-80 shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] text-foreground/50 truncate">{s.label}</p>
                  <p className={`text-lg sm:text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
              <Input
                placeholder="Search name, ID, email…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger><SelectValue placeholder="All Departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Departments</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPosition} onValueChange={setFilterPosition}>
              <SelectTrigger><SelectValue placeholder="All Positions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Positions</SelectItem>
                {ALL_POSITIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Teacher Cards */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Teaching Staff ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-foreground/40 text-sm">No teachers found. Try adjusting filters.</div>
          )}
          {filtered.map(teacher => {
            const isExpanded = expandedId === teacher.id;
            const avatarCls  = AVATAR_COLORS[teacher.id % AVATAR_COLORS.length];
            return (
              <div key={teacher.id} className="border border-border rounded-xl overflow-hidden transition-all">
                {/* ── Card row ── */}
                <div className="flex items-start sm:items-center gap-3 p-3 sm:p-4 hover:bg-accent/30 transition-colors">
                  {/* Avatar */}
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 mt-0.5 sm:mt-0">
                    <AvatarFallback className={`font-bold text-sm ${avatarCls}`}>{teacher.initials}</AvatarFallback>
                  </Avatar>

                  {/* Main info — grows */}
                  <div className="flex-1 min-w-0">
                    {/* Name + badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-foreground text-sm leading-tight">{teacher.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4 shrink-0">{teacher.empId}</Badge>
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${statusColor(teacher.status)}`}>{teacher.status}</Badge>
                    </div>
                    {/* Designation line */}
                    <p className="text-xs text-foreground/55 mt-0.5 truncate">
                      {teacher.designation} · {teacher.department} · {teacher.experience} exp
                    </p>
                    {/* Position chips — hidden on very small, shown from xs */}
                    <div className="hidden xs:flex flex-wrap gap-1 mt-1.5">
                      {teacher.positions.slice(0,3).map(pos => {
                        const meta = getPositionMeta(pos);
                        return (
                          <span key={pos} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
                            <meta.icon className="h-2.5 w-2.5" />
                            <span className="hidden sm:inline">{pos === "Class Teacher" && teacher.classTeacherOf ? `CT – ${teacher.classTeacherOf}` : pos}</span>
                          </span>
                        );
                      })}
                      {teacher.positions.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-accent text-foreground/60">+{teacher.positions.length - 3}</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View profile" onClick={() => setViewTeacher(teacher)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit teacher" onClick={() => setEditTeacher({ ...teacher })}>
                      <Pencil className="h-3.5 w-3.5 text-violet-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Remove" onClick={() => setDeleteTeacher(teacher)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Expand" onClick={() => setExpandedId(isExpanded ? null : teacher.id)}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* ── Expanded row ── */}
                {isExpanded && (
                  <div className="border-t border-border bg-accent/20 px-4 py-4 space-y-3">
                    {/* Contact info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                        <span className="text-foreground/70 truncate text-xs">{teacher.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                        <span className="text-foreground/70 text-xs">{teacher.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                        <span className="text-foreground/70 text-xs">{teacher.city}, {teacher.state}</span>
                      </div>
                    </div>

                    {/* Class teacher badge */}
                    {teacher.classTeacherOf && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                        <School className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">Class Teacher of Class {teacher.classTeacherOf}</span>
                      </div>
                    )}

                    {/* Class-subject chips */}
                    {teacher.classSubjects.length > 0 ? (
                      <div>
                        <p className="text-[10px] text-foreground/50 uppercase tracking-wide font-medium mb-2">Classes & Subjects</p>
                        <div className="flex flex-wrap gap-2">
                          {teacher.classSubjects.map((cs,i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs">
                              <span className="font-semibold text-foreground">Cls {cs.className}:</span>
                              <span className="text-foreground/70">{cs.subjects.join(", ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-foreground/40 italic">No class assignments yet.</p>
                    )}

                    {/* Certs */}
                    <div className="flex gap-1.5 flex-wrap pt-1 border-t border-border">
                      {([teacher.bEd && "B.Ed", teacher.tet && "TET", teacher.ctet && "CTET"] as (string|false)[]).filter(Boolean).map(cert => (
                        <span key={cert as string} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          <Check className="h-2.5 w-2.5" />{cert}
                        </span>
                      ))}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-accent text-foreground/60">
                        {teacher.highestQualification}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── View Dialog ── */}
      <Dialog open={!!viewTeacher} onOpenChange={() => setViewTeacher(null)}>
        {viewTeacher && (
          <TeacherDetailSheet
            teacher={viewTeacher}
            onClose={() => setViewTeacher(null)}
            onEdit={() => { setEditTeacher({ ...viewTeacher }); setViewTeacher(null); }}
          />
        )}
      </Dialog>

      {/* ── Edit Panel — sidebar+topnav-aware overlay ── */}
      {editTeacher && (
        <FullEditDialog
          teacher={editTeacher}
          onSave={handleSaveEdit}
          onClose={() => setEditTeacher(null)}
        />
      )}

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteTeacher} onOpenChange={open => { if (!open) setDeleteTeacher(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Teacher</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground/70 py-2">
            Are you sure you want to remove <strong className="text-foreground">{deleteTeacher?.name}</strong>?
            All their class assignments and positions will also be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTeacher(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove Teacher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}