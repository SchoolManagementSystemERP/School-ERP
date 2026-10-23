import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Search, Eye, Mail, Phone, Plus, Pencil, Trash2,
  GraduationCap, TrendingUp, AlertTriangle, Users,
  ArrowLeft, User, Home, FileText, School, Heart,
  Stethoscope, Bus, BookOpen, Shield, CreditCard,
  CheckCircle2, XCircle, Calendar, Hash, Globe,
  MapPin, Banknote, AlertCircle, ChevronRight, Save, X,
} from "lucide-react";

import type { FeeRecord, Performance, Student } from "@/types/student";
import { createStudent, useClassRoster, useStudents } from "@/store/students";
import { StatCard, toneFrom } from "@/components/common/StatCard";
import { useSectionBase } from "@/lib/section";

// ─── Constants ───────────────────────────────────────────────────────────────



const emptyForm = {
  name: "", rollNo: "", class: "Class 10-A", email: "", phone: "",
  attendance: 90, performance: "Good" as Performance,
};

// ─── Profile Tabs ─────────────────────────────────────────────────────────────

type TabId = "overview" | "admission" | "address" | "parents" | "health" | "transport" | "activities" | "fees" | "documents";

const PROFILE_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview",    label: "Overview",      icon: User          },
  { id: "admission",   label: "Admission",     icon: GraduationCap },
  { id: "address",     label: "Address",       icon: Home          },
  { id: "parents",     label: "Parents",       icon: Users         },
  { id: "health",      label: "Health",        icon: Stethoscope   },
  { id: "transport",   label: "Transport",     icon: Bus           },
  { id: "activities",  label: "Activities",    icon: BookOpen      },
  { id: "fees",        label: "Fees",          icon: CreditCard    },
  { id: "documents",   label: "Documents",     icon: FileText      },
];

// ─── Reusable Edit Field Components ──────────────────────────────────────────

const inputCls = "w-full h-8 px-2.5 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 [color-scheme:light] dark:[color-scheme:dark]";
const selectCls = "w-full h-8 px-2 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500";

function EditField({
  label, value, onChange, type = "text", icon: Icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; icon?: React.ElementType;
}) {
  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-foreground/40 shrink-0" />}
        <span className="text-xs text-foreground/50">{label}</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}

function EditSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-foreground/50">{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── View Row (read-only) ─────────────────────────────────────────────────────

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      {Icon && <Icon className="h-3.5 w-3.5 text-foreground/40 mt-0.5 shrink-0" />}
      <span className="text-xs text-foreground/50 w-36 shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium">{value || "—"}</span>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Tab Edit Bar ─────────────────────────────────────────────────────────────

function TabEditBar({
  editing, onEdit, onSave, onCancel,
}: {
  editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2 justify-end mb-4">
        <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 gap-1.5" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> Save Changes
        </Button>
      </div>
    );
  }
  return (
    <div className="flex justify-end mb-4">
      <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
    </div>
  );
}

// ─── Student Profile View ─────────────────────────────────────────────────────

function StudentProfile({
  student, onBack, onUpdate,
}: {
  student: Student; onBack: () => void; onUpdate: (updated: Student) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editingTab, setEditingTab] = useState<TabId | null>(null);
  const [draft, setDraft] = useState<Student>(student);

  const isEditing = editingTab === activeTab;

  const startEdit = () => {
    setDraft({ ...student });
    setEditingTab(activeTab);
  };

  const cancelEdit = () => {
    setDraft({ ...student });
    setEditingTab(null);
  };

  const saveEdit = () => {
    // Sync name fields
    const updated: Student = {
      ...draft,
      name: `${draft.firstName} ${draft.middleName} ${draft.lastName}`.replace(/\s+/g, " ").trim(),
      initials: `${draft.firstName[0] ?? ""}${draft.lastName[0] ?? ""}`.toUpperCase(),
    };
    onUpdate(updated);
    setEditingTab(null);
  };

  const set = (field: keyof Student) => (value: string | boolean | string[]) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const getPerformanceBadge = (p: string) => {
    const map: Record<string, string> = {
      Excellent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      Good:      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      Average:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
      Poor:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    };
    return map[p] ?? "bg-muted text-foreground";
  };

  const getAttendanceColor = (a: number) =>
    a >= 90 ? "text-green-600" : a >= 75 ? "text-yellow-600" : "text-red-600";

  const feeStatusStyle: Record<string, string> = {
    Paid:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    Overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };

  const totalDue   = student.feeRecords.reduce((s, r) => s + r.tuition + r.transport + r.misc, 0);
  const totalPaid  = student.feeRecords.reduce((s, r) => s + r.paid, 0);
  const totalPending = totalDue - totalPaid;

  // ── Tab Content ─────────────────────────────────────────────────────────────

  const renderTab = () => {
    switch (activeTab) {

      // ── OVERVIEW ──────────────────────────────────────────────────────────
      case "overview":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Personal Details" icon={User}>
              <EditField label="First Name"   value={draft.firstName}   onChange={set("firstName")} />
              <EditField label="Middle Name"  value={draft.middleName}  onChange={set("middleName")} />
              <EditField label="Last Name"    value={draft.lastName}    onChange={set("lastName")} />
              <EditField label="Date of Birth" value={draft.dob}        onChange={set("dob")} type="date" icon={Calendar} />
              <EditSelect label="Gender"      value={draft.gender}      onChange={set("gender")}
                options={["Male", "Female", "Other"]} />
              <EditSelect label="Blood Group" value={draft.bloodGroup}  onChange={set("bloodGroup")}
                options={["A+","A-","B+","B-","O+","O-","AB+","AB-"]} />
              <EditField label="Nationality"  value={draft.nationality} onChange={set("nationality")} icon={Globe} />
              <EditField label="Religion"     value={draft.religion}    onChange={set("religion")} />
              <EditSelect label="Category"    value={draft.category}    onChange={set("category")}
                options={["General","OBC","SC","ST"]} />
              <EditField label="Mobile"       value={draft.phone}       onChange={set("phone")} icon={Phone} />
              <EditField label="Email"        value={draft.email}       onChange={set("email")} type="email" icon={Mail} />
            </SectionCard>
            <div className="space-y-4">
              <SectionCard title="Academic Summary" icon={GraduationCap}>
                <EditField label="Class"         value={draft.admissionClass}   onChange={set("admissionClass")} />
                <EditField label="Section"       value={draft.admissionSection} onChange={set("admissionSection")} />
                <EditField label="Roll No."      value={draft.rollNo}           onChange={set("rollNo")} icon={Hash} />
                <EditField label="Academic Year" value={draft.academicYear}     onChange={set("academicYear")} />
                <EditSelect label="Medium"       value={draft.medium}           onChange={set("medium")}
                  options={["English","Hindi","Hindi & English"]} />
                <EditSelect label="Performance"  value={draft.performance}      onChange={(v) => setDraft(d => ({...d, performance: v as Performance}))}
                  options={["Excellent","Good","Average","Poor"]} />
                <EditField label="Attendance %"  value={String(draft.attendance)} onChange={(v) => setDraft(d => ({...d, attendance: Number(v)}))} type="number" />
              </SectionCard>
              <SectionCard title="Quick Contact" icon={Phone}>
                <EditField label="Father's Phone" value={draft.fatherPhone} onChange={set("fatherPhone")} icon={Phone} />
                <EditField label="Mother's Phone" value={draft.motherPhone} onChange={set("motherPhone")} icon={Phone} />
                <EditField label="Father's Name"  value={draft.fatherName}  onChange={set("fatherName")} />
                <EditField label="Mother's Name"  value={draft.motherName}  onChange={set("motherName")} />
              </SectionCard>
            </div>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Personal Details" icon={User}>
              <InfoRow label="Full Name"       value={`${student.firstName} ${student.middleName} ${student.lastName}`.trim()} />
              <InfoRow label="Date of Birth"   value={student.dob} icon={Calendar} />
              <InfoRow label="Gender"          value={student.gender} />
              <InfoRow label="Blood Group"     value={student.bloodGroup} />
              <InfoRow label="Nationality"     value={student.nationality} icon={Globe} />
              <InfoRow label="Religion"        value={student.religion} />
              <InfoRow label="Category"        value={student.category} />
              <InfoRow label="Mobile"          value={student.phone} icon={Phone} />
              <InfoRow label="Email"           value={student.email} icon={Mail} />
            </SectionCard>
            <div className="space-y-4">
              <SectionCard title="Academic Summary" icon={GraduationCap}>
                <InfoRow label="Class & Section" value={`Class ${student.admissionClass} – ${student.admissionSection}`} />
                <InfoRow label="Roll No."        value={student.rollNo} icon={Hash} />
                <InfoRow label="Admission No."   value={student.admissionNo} />
                <InfoRow label="Academic Year"   value={student.academicYear} />
                <InfoRow label="Medium"          value={student.medium} />
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-xs text-foreground/50 w-36">Performance</span>
                  <Badge className={getPerformanceBadge(student.performance)}>{student.performance}</Badge>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-foreground/50 w-36">Attendance</span>
                  <span className={`text-sm font-semibold ${getAttendanceColor(student.attendance)}`}>{student.attendance}%</span>
                </div>
              </SectionCard>
              <SectionCard title="Quick Contact" icon={Phone}>
                <InfoRow label="Father's Phone" value={student.fatherPhone} icon={Phone} />
                <InfoRow label="Mother's Phone" value={student.motherPhone} icon={Phone} />
                <InfoRow label="Father's Name"  value={student.fatherName} />
                <InfoRow label="Mother's Name"  value={student.motherName} />
              </SectionCard>
            </div>
          </div>
        );

      // ── ADMISSION ─────────────────────────────────────────────────────────
      case "admission":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Admission Details" icon={GraduationCap}>
              <EditField label="Admission No."  value={draft.admissionNo}       onChange={set("admissionNo")} icon={Hash} />
              <EditField label="Admission Date" value={draft.admissionDate}     onChange={set("admissionDate")} type="date" icon={Calendar} />
              <EditField label="Class"          value={draft.admissionClass}    onChange={set("admissionClass")} />
              <EditField label="Section"        value={draft.admissionSection}  onChange={set("admissionSection")} />
              <EditField label="Academic Year"  value={draft.academicYear}      onChange={set("academicYear")} />
              <EditSelect label="Medium"        value={draft.medium}            onChange={set("medium")}
                options={["English","Hindi","Hindi & English"]} />
              <EditField label="Roll No."       value={draft.rollNo}            onChange={set("rollNo")} />
            </SectionCard>
            <SectionCard title="Previous School" icon={School}>
              <EditField label="School Name"   value={draft.prevSchoolName}   onChange={set("prevSchoolName")} />
              <EditSelect label="Board"        value={draft.prevSchoolBoard}  onChange={set("prevSchoolBoard")}
                options={["CBSE","ICSE","State Board","IB","Others"]} />
              <EditField label="Last Class"    value={draft.prevClass}        onChange={set("prevClass")} />
              <EditField label="Percentage"    value={draft.prevPercentage}   onChange={set("prevPercentage")} />
              <EditField label="TC Number"     value={draft.tcNo}             onChange={set("tcNo")} />
            </SectionCard>
            <SectionCard title="Identity Documents" icon={FileText}>
              <EditField label="Aadhar No."       value={draft.aadharNo}     onChange={set("aadharNo")} />
              <EditField label="Birth Cert. No."  value={draft.birthCertNo}  onChange={set("birthCertNo")} />
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Admission Details" icon={GraduationCap}>
              <InfoRow label="Admission No."  value={student.admissionNo} icon={Hash} />
              <InfoRow label="Admission Date" value={student.admissionDate} icon={Calendar} />
              <InfoRow label="Class"          value={`${student.admissionClass} – ${student.admissionSection}`} />
              <InfoRow label="Academic Year"  value={student.academicYear} />
              <InfoRow label="Medium"         value={student.medium} />
              <InfoRow label="Roll No."       value={student.rollNo} />
            </SectionCard>
            <SectionCard title="Previous School" icon={School}>
              <InfoRow label="School Name"   value={student.prevSchoolName} />
              <InfoRow label="Board"         value={student.prevSchoolBoard} />
              <InfoRow label="Last Class"    value={student.prevClass} />
              <InfoRow label="Percentage"    value={student.prevPercentage ? `${student.prevPercentage}%` : ""} />
              <InfoRow label="TC Number"     value={student.tcNo} />
            </SectionCard>
            <SectionCard title="Identity Documents" icon={FileText}>
              <InfoRow label="Aadhar No."       value={student.aadharNo} />
              <InfoRow label="Birth Cert. No."  value={student.birthCertNo} />
            </SectionCard>
          </div>
        );

      // ── ADDRESS ───────────────────────────────────────────────────────────
      case "address":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Present Address" icon={MapPin}>
              <EditField label="Address" value={draft.presentAddress}  onChange={set("presentAddress")} />
              <EditField label="City"    value={draft.presentCity}     onChange={set("presentCity")} />
              <EditField label="State"   value={draft.presentState}    onChange={set("presentState")} />
              <EditField label="PIN"     value={draft.presentPincode}  onChange={set("presentPincode")} />
            </SectionCard>
            <SectionCard title="Permanent Address" icon={Home}>
              <EditField label="Address" value={draft.permanentAddress}  onChange={set("permanentAddress")} />
              <EditField label="City"    value={draft.permanentCity}     onChange={set("permanentCity")} />
              <EditField label="State"   value={draft.permanentState}    onChange={set("permanentState")} />
              <EditField label="PIN"     value={draft.permanentPincode}  onChange={set("permanentPincode")} />
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Present Address" icon={MapPin}>
              <InfoRow label="Address" value={student.presentAddress} />
              <InfoRow label="City"    value={student.presentCity} />
              <InfoRow label="State"   value={student.presentState} />
              <InfoRow label="PIN"     value={student.presentPincode} />
            </SectionCard>
            <SectionCard title="Permanent Address" icon={Home}>
              <InfoRow label="Address" value={student.permanentAddress} />
              <InfoRow label="City"    value={student.permanentCity} />
              <InfoRow label="State"   value={student.permanentState} />
              <InfoRow label="PIN"     value={student.permanentPincode} />
            </SectionCard>
          </div>
        );

      // ── PARENTS ───────────────────────────────────────────────────────────
      case "parents":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Father's Details" icon={Users}>
              <EditField label="Name"          value={draft.fatherName}         onChange={set("fatherName")} />
              <EditField label="Occupation"    value={draft.fatherOccupation}   onChange={set("fatherOccupation")} />
              <EditField label="Phone"         value={draft.fatherPhone}        onChange={set("fatherPhone")} icon={Phone} />
              <EditField label="Email"         value={draft.fatherEmail}        onChange={set("fatherEmail")} type="email" icon={Mail} />
              <EditSelect label="Annual Income" value={draft.fatherAnnualIncome} onChange={set("fatherAnnualIncome")}
                options={["Below ₹1L","₹1L - ₹3L","₹3L - ₹5L","₹5L - ₹10L","₹10L - ₹20L","Above ₹20L"]} />
            </SectionCard>
            <SectionCard title="Mother's Details" icon={Heart}>
              <EditField label="Name"       value={draft.motherName}       onChange={set("motherName")} />
              <EditField label="Occupation" value={draft.motherOccupation} onChange={set("motherOccupation")} />
              <EditField label="Phone"      value={draft.motherPhone}      onChange={set("motherPhone")} icon={Phone} />
              <EditField label="Email"      value={draft.motherEmail}      onChange={set("motherEmail")} type="email" icon={Mail} />
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Father's Details" icon={Users}>
              <InfoRow label="Name"          value={student.fatherName} />
              <InfoRow label="Occupation"    value={student.fatherOccupation} />
              <InfoRow label="Phone"         value={student.fatherPhone} icon={Phone} />
              <InfoRow label="Email"         value={student.fatherEmail} icon={Mail} />
              <InfoRow label="Annual Income" value={student.fatherAnnualIncome} />
            </SectionCard>
            <SectionCard title="Mother's Details" icon={Heart}>
              <InfoRow label="Name"       value={student.motherName} />
              <InfoRow label="Occupation" value={student.motherOccupation} />
              <InfoRow label="Phone"      value={student.motherPhone} icon={Phone} />
              <InfoRow label="Email"      value={student.motherEmail} icon={Mail} />
            </SectionCard>
          </div>
        );

      // ── HEALTH ────────────────────────────────────────────────────────────
      case "health":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Physical Stats" icon={Stethoscope}>
              <EditField label="Height (cm)" value={draft.height}          onChange={set("height")} type="number" />
              <EditField label="Weight (kg)" value={draft.weight}          onChange={set("weight")} type="number" />
              <EditSelect label="Blood Group" value={draft.bloodGroupHealth} onChange={set("bloodGroupHealth")}
                options={["A+","A-","B+","B-","O+","O-","AB+","AB-"]} />
            </SectionCard>
            <SectionCard title="Medical Info" icon={AlertCircle}>
              <EditField label="Medical Conditions" value={draft.medicalCondition} onChange={set("medicalCondition")} />
              <EditField label="Allergies"           value={draft.allergies}        onChange={set("allergies")} />
              <EditField label="Doctor's Name"       value={draft.doctorName}       onChange={set("doctorName")} />
              <EditField label="Doctor's Phone"      value={draft.doctorPhone}      onChange={set("doctorPhone")} icon={Phone} />
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Physical Stats" icon={Stethoscope}>
              <InfoRow label="Height"      value={student.height ? `${student.height} cm` : ""} />
              <InfoRow label="Weight"      value={student.weight ? `${student.weight} kg` : ""} />
              <InfoRow label="Blood Group" value={student.bloodGroupHealth} />
            </SectionCard>
            <SectionCard title="Medical Info" icon={AlertCircle}>
              <InfoRow label="Medical Conditions" value={student.medicalCondition || "None"} />
              <InfoRow label="Allergies"           value={student.allergies || "None"} />
              <InfoRow label="Doctor's Name"       value={student.doctorName} />
              <InfoRow label="Doctor's Phone"      value={student.doctorPhone} icon={Phone} />
            </SectionCard>
          </div>
        );

      // ── TRANSPORT ─────────────────────────────────────────────────────────
      case "transport":
        if (isEditing) return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Transport Status" icon={Bus}>
              <div className="py-2 border-b border-border">
                <span className="text-xs text-foreground/50 block mb-1">Transport Required</span>
                <div className="flex gap-3">
                  {[true, false].map((val) => (
                    <button
                      key={String(val)}
                      onClick={() => setDraft(d => ({ ...d, needsTransport: val }))}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors
                        ${draft.needsTransport === val
                          ? "bg-violet-600 text-white border-violet-600"
                          : "border-border text-foreground/60 hover:border-violet-400"}`}
                    >
                      {val ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
              {draft.needsTransport && (
                <>
                  <EditField label="Bus Route"    value={draft.busRoute}      onChange={set("busRoute")} />
                  <EditField label="Bus Stop"     value={draft.busStop}       onChange={set("busStop")} icon={MapPin} />
                  <EditField label="Pickup Addr." value={draft.pickupAddress} onChange={set("pickupAddress")} />
                </>
              )}
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Transport Status" icon={Bus}>
              <div className="flex items-center gap-3 py-2">
                <span className="text-xs text-foreground/50 w-36">Transport Required</span>
                {student.needsTransport
                  ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Yes</Badge>
                  : <Badge className="bg-muted text-foreground/80">No</Badge>
                }
              </div>
              {student.needsTransport && (
                <>
                  <InfoRow label="Bus Route"    value={student.busRoute} />
                  <InfoRow label="Bus Stop"     value={student.busStop} icon={MapPin} />
                  <InfoRow label="Pickup Addr." value={student.pickupAddress} />
                </>
              )}
              {!student.needsTransport && (
                <p className="text-sm text-foreground/40 py-2">Student travels by own arrangement.</p>
              )}
            </SectionCard>
          </div>
        );

      // ── ACTIVITIES ────────────────────────────────────────────────────────
      case "activities":
        if (isEditing) return (
          <div className="grid grid-cols-1 gap-4">
            <SectionCard title="Sports" icon={BookOpen}>
              <div className="py-2">
                <span className="text-xs text-foreground/50 block mb-1">Comma-separated list</span>
                <input
                  value={draft.sports.join(", ")}
                  onChange={(e) => setDraft(d => ({ ...d, sports: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                  placeholder="e.g. Cricket, Football, Badminton"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {draft.sports.map(s => (
                  <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{s}</span>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Arts & Culture" icon={BookOpen}>
              <div className="py-2">
                <span className="text-xs text-foreground/50 block mb-1">Comma-separated list</span>
                <input
                  value={draft.arts.join(", ")}
                  onChange={(e) => setDraft(d => ({ ...d, arts: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                  placeholder="e.g. Drawing, Dance, Theatre"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {draft.arts.map(a => (
                  <span key={a} className="px-3 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">{a}</span>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Other Achievements" icon={TrendingUp}>
              <input
                value={draft.otherActivities}
                onChange={(e) => setDraft(d => ({ ...d, otherActivities: e.target.value }))}
                placeholder="e.g. School captain, District chess winner"
                className={`${inputCls} mt-1`}
              />
            </SectionCard>
          </div>
        );
        return (
          <div className="grid grid-cols-1 gap-4">
            <SectionCard title="Sports" icon={BookOpen}>
              {student.sports.length > 0
                ? <div className="flex flex-wrap gap-2 pt-1">
                    {student.sports.map(s => (
                      <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{s}</span>
                    ))}
                  </div>
                : <p className="text-sm text-foreground/40">None selected</p>
              }
            </SectionCard>
            <SectionCard title="Arts & Culture" icon={BookOpen}>
              {student.arts.length > 0
                ? <div className="flex flex-wrap gap-2 pt-1">
                    {student.arts.map(a => (
                      <span key={a} className="px-3 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">{a}</span>
                    ))}
                  </div>
                : <p className="text-sm text-foreground/40">None selected</p>
              }
            </SectionCard>
            {student.otherActivities && (
              <SectionCard title="Other Achievements" icon={TrendingUp}>
                <p className="text-sm text-foreground">{student.otherActivities}</p>
              </SectionCard>
            )}
          </div>
        );

      // ── FEES ──────────────────────────────────────────────────────────────
      case "fees":
        if (isEditing) return (
          <div className="space-y-4">
            <SectionCard title="Fee Settings" icon={CreditCard}>
              <EditSelect label="Fee Category"    value={draft.feeCategory}     onChange={set("feeCategory")}
                options={["Regular","RTE","Staff Ward","Others"]} />
              <EditSelect label="Concession Type" value={draft.concessionType}  onChange={set("concessionType")}
                options={["None","Merit","Need Based","OBC Concession","SC/ST Concession","RTE","Staff Ward","Others"]} />
              {draft.concessionType !== "None" && (
                <EditField label="Concession %" value={draft.concessionPercent} onChange={set("concessionPercent")} type="number" />
              )}
            </SectionCard>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Fee Ledger — {student.academicYear}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/40">
                        <th className="text-left p-3 text-xs font-medium text-foreground/60">Month</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Paid (₹)</th>
                        <th className="text-center p-3 text-xs font-medium text-foreground/60">Status</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.feeRecords.map((rec, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="p-3 font-medium text-xs">{rec.month}</td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              value={rec.paid}
                              onChange={(e) => setDraft(d => ({
                                ...d,
                                feeRecords: d.feeRecords.map((r, idx) =>
                                  idx === i ? { ...r, paid: Number(e.target.value) } : r
                                ),
                              }))}
                              className={`${inputCls} w-24 ml-auto`}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <select
                              value={rec.status}
                              onChange={(e) => setDraft(d => ({
                                ...d,
                                feeRecords: d.feeRecords.map((r, idx) =>
                                  idx === i ? { ...r, status: e.target.value as FeeRecord["status"] } : r
                                ),
                              }))}
                              className={`${selectCls} w-28`}
                            >
                              {["Paid","Pending","Overdue"].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-right">
                            <input
                              value={rec.date}
                              onChange={(e) => setDraft(d => ({
                                ...d,
                                feeRecords: d.feeRecords.map((r, idx) =>
                                  idx === i ? { ...r, date: e.target.value } : r
                                ),
                              }))}
                              className={`${inputCls} w-28 ml-auto`}
                              placeholder="DD Mon YYYY"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Fee Category",  value: student.feeCategory,                              color: "text-foreground" },
                { label: "Concession",    value: student.concessionType !== "None" ? `${student.concessionType} (${student.concessionPercent}%)` : "None", color: "text-violet-600" },
                { label: "Total Paid",    value: `₹${totalPaid.toLocaleString()}`,                  color: "text-green-600" },
                { label: "Total Pending", value: `₹${totalPending.toLocaleString()}`,               color: totalPending > 0 ? "text-red-600" : "text-green-600" },
              ].map(stat => (
                <Card key={stat.label}>
                  <CardContent className="p-3">
                    <p className="text-xs text-foreground/50">{stat.label}</p>
                    <p className={`text-base font-semibold mt-0.5 ${stat.color}`}>{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Fee Ledger — {student.academicYear}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/40">
                        <th className="text-left p-3 text-xs font-medium text-foreground/60">Month</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Tuition</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Transport</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Misc</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Total Due</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Paid</th>
                        <th className="text-right p-3 text-xs font-medium text-foreground/60">Date</th>
                        <th className="text-center p-3 text-xs font-medium text-foreground/60">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.feeRecords.map((rec, i) => {
                        const due = rec.tuition + rec.transport + rec.misc;
                        return (
                          <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                            <td className="p-3 font-medium">{rec.month}</td>
                            <td className="p-3 text-right text-foreground/70">₹{rec.tuition.toLocaleString()}</td>
                            <td className="p-3 text-right text-foreground/70">
                              {rec.transport > 0 ? `₹${rec.transport.toLocaleString()}` : <span className="text-foreground/30">—</span>}
                            </td>
                            <td className="p-3 text-right text-foreground/70">₹{rec.misc.toLocaleString()}</td>
                            <td className="p-3 text-right font-medium">₹{due.toLocaleString()}</td>
                            <td className={`p-3 text-right font-semibold ${rec.paid > 0 ? "text-green-600" : "text-red-500"}`}>
                              {rec.paid > 0 ? `₹${rec.paid.toLocaleString()}` : "—"}
                            </td>
                            <td className="p-3 text-right text-xs text-foreground/50">{rec.date}</td>
                            <td className="p-3 text-center">
                              <Badge className={`text-xs ${feeStatusStyle[rec.status]}`}>{rec.status}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-accent/40 font-semibold">
                        <td className="p-3">Total</td>
                        <td colSpan={3} className="p-3"></td>
                        <td className="p-3 text-right">₹{totalDue.toLocaleString()}</td>
                        <td className="p-3 text-right text-green-600">₹{totalPaid.toLocaleString()}</td>
                        <td className="p-3"></td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-semibold ${totalPending > 0 ? "text-red-600" : "text-green-600"}`}>
                            {totalPending > 0 ? `₹${totalPending.toLocaleString()} due` : "Clear"}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      // ── DOCUMENTS ─────────────────────────────────────────────────────────
      case "documents": {
        const docDefs = [
          { key: "docBirthCert" as keyof Student, label: "Birth Certificate (Original + Photocopy)" },
          { key: "docAadhar"    as keyof Student, label: "Aadhar Card (Student & Parents)" },
          { key: "docTC"        as keyof Student, label: "Transfer Certificate from Previous School" },
          { key: "docMarksheet" as keyof Student, label: "Last Year Mark Sheet / Report Card" },
          { key: "docPhotos"    as keyof Student, label: "Passport Size Photographs (4 copies)" },
          { key: "docCasteCert" as keyof Student, label: "Caste Certificate (if applicable)" },
        ];
        const src = isEditing ? draft : student;
        const submittedCount = docDefs.filter(d => src[d.key] as boolean).length;
        return (
          <SectionCard title="Documents Checklist" icon={FileText}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-foreground/60">Submitted:</span>
              <span className={`text-sm font-semibold ${submittedCount === docDefs.length ? "text-green-600" : "text-orange-500"}`}>
                {submittedCount} / {docDefs.length}
              </span>
              {submittedCount < docDefs.length && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs ml-1">
                  {docDefs.length - submittedCount} Pending
                </Badge>
              )}
            </div>
            <div className="space-y-3">
              {docDefs.map(doc => {
                const submitted = src[doc.key] as boolean;
                return (
                  <div key={doc.key} className="flex items-center gap-3">
                    {isEditing ? (
                      <button
                        onClick={() => setDraft(d => ({ ...d, [doc.key]: !d[doc.key] }))}
                        className="shrink-0"
                      >
                        {submitted
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <XCircle className="h-4 w-4 text-red-400" />
                        }
                      </button>
                    ) : (
                      submitted
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <span className={`text-sm ${submitted ? "text-foreground" : "text-foreground/50"}`}>{doc.label}</span>
                    {isEditing && (
                      <span className="ml-auto text-xs text-foreground/40">click to toggle</span>
                    )}
                    {!isEditing && !submitted && (
                      <Badge className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs">Missing</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Student Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Admission No: {student.admissionNo}</p>
        </div>
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-5 flex-wrap">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="text-xl bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200 font-semibold">
                {student.initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-foreground">{student.name}</h2>
                <Badge variant="outline" className="font-mono text-xs">Roll: {student.rollNo}</Badge>
                <Badge className={getPerformanceBadge(student.performance)}>{student.performance}</Badge>
              </div>
              <div className="flex items-center gap-4 mt-1.5 flex-wrap text-sm text-foreground/60">
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{student.class}</span>
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{student.email}</span>
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{student.phone}</span>
                <span className={`flex items-center gap-1.5 font-medium ${student.attendance >= 90 ? "text-green-600" : student.attendance >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                  Attendance: {student.attendance}%
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-foreground/40">Academic Year</p>
              <p className="text-sm font-semibold text-foreground">{student.academicYear}</p>
              <p className="text-xs text-foreground/40 mt-2">Admitted</p>
              <p className="text-sm font-semibold text-foreground">{student.admissionDate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max border-b border-border pb-0">
          {PROFILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if (editingTab !== null && editingTab !== tab.id) {
                  cancelEdit();
                }
                setActiveTab(tab.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-px
                ${activeTab === tab.id
                  ? "border-violet-600 text-violet-600 bg-violet-50 dark:bg-violet-900/20"
                  : "border-transparent text-foreground/50 hover:text-foreground hover:border-border"
                }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === "fees" && totalPending > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Edit Bar + Tab Content */}
      <div>
        <TabEditBar
          editing={isEditing}
          onEdit={startEdit}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
        {renderTab()}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrincipalStudents() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const { students, addStudent, updateStudent, removeStudent } = useStudents();
  const classes = ["All Classes", ...useClassRoster().classes];
  const [selectedClass, setSelectedClass]   = useState("All Classes");
  const [searchQuery, setSearchQuery]       = useState("");
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [editStudent, setEditStudent]       = useState<Student | null>(null);
  const [deleteStudent, setDeleteStudent]   = useState<Student | null>(null);
  const [addOpen, setAddOpen]               = useState(false);
  const [form, setForm]                     = useState(emptyForm);

  const handleProfileUpdate = (updated: Student) => {
    updateStudent(updated);
    setProfileStudent(updated);
  };

  if (profileStudent) {
    return (
      <StudentProfile
        student={profileStudent}
        onBack={() => setProfileStudent(null)}
        onUpdate={handleProfileUpdate}
      />
    );
  }

  const filtered = students.filter((s) => {
    const classMatch = selectedClass === "All Classes" || s.class === selectedClass;
    const search = searchQuery.toLowerCase();
    return classMatch && (s.name.toLowerCase().includes(search) || s.rollNo.includes(search));
  });

  const getPerformanceBadge = (p: string) => {
    const map: Record<string, string> = {
      Excellent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      Good:      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      Average:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
      Poor:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    };
    return map[p] ?? "bg-muted text-foreground";
  };

  const getAttendanceColor = (a: number) =>
    a >= 90 ? "text-green-600" : a >= 75 ? "text-yellow-600" : "text-red-600";

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleAdd = () => {
    // "Class 10-A" → admission class "10", section "A"
    const [admissionClass = "", admissionSection = ""] = form.class.replace(/^Class\s+/, "").split("-");
    addStudent(createStudent({
      name: form.name,
      class: form.class,
      rollNo: form.rollNo,
      email: form.email,
      phone: form.phone,
      attendance: Number(form.attendance),
      performance: form.performance,
      admissionClass,
      admissionSection,
    }));
    setAddOpen(false);
    setForm(emptyForm);
  };

  const handleSaveEdit = () => {
    if (!editStudent) return;
    updateStudent({ ...editStudent, initials: getInitials(editStudent.name) });
    setEditStudent(null);
  };

  const handleDelete = () => {
    if (!deleteStudent) return;
    removeStudent(deleteStudent.id);
    setDeleteStudent(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all students across every class</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Quick Add
          </Button>
          <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => navigate(`${base}/setup/students`)}>
            <Plus className="h-4 w-4 mr-2" /> New Admission
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Students",  value: students.length,                                                               icon: Users,         color: "text-foreground" },
          { label: "Excellent",       value: students.filter(s => s.performance === "Excellent").length,                    icon: TrendingUp,    color: "text-green-600" },
          { label: "Avg. Attendance", value: `${Math.round(students.reduce((a, s) => a + s.attendance, 0) / students.length)}%`, icon: GraduationCap, color: "text-blue-600" },
          { label: "Need Attention",  value: students.filter(s => s.attendance < 85 || s.performance === "Poor").length,    icon: AlertTriangle,  color: "text-orange-600" },
        ].map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                placeholder="Search by name or roll no…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Student List */}
      <Card>
        <CardHeader><CardTitle>Student List ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Avatar>
                    <AvatarFallback className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200 font-semibold">
                      {student.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-foreground">{student.name}</h4>
                      <Badge variant="outline" className="font-mono text-xs">{student.rollNo}</Badge>
                    </div>
                    <p className="text-sm text-foreground/60">{student.class}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-foreground/50">Attendance</p>
                    <p className={`text-sm font-semibold ${getAttendanceColor(student.attendance)}`}>{student.attendance}%</p>
                  </div>
                  <Badge className={getPerformanceBadge(student.performance)}>{student.performance}</Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setProfileStudent(student)} title="View full profile">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditStudent({ ...student })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteStudent(student)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="hidden md:flex items-center gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                    onClick={() => setProfileStudent(student)}
                  >
                    Full Profile <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-foreground/40">No students found</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Student</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[
              { label: "Full Name",    key: "name",       type: "text"   },
              { label: "Roll No",      key: "rollNo",     type: "text"   },
              { label: "Email",        key: "email",      type: "email"  },
              { label: "Phone",        key: "phone",      type: "text"   },
              { label: "Attendance %", key: "attendance", type: "number" },
            ].map(({ label, key, type }) => (
              <div key={key} className={key === "name" || key === "email" ? "col-span-2" : ""}>
                <Label className="mb-1 block">{label}</Label>
                <Input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label className="mb-1 block">Class</Label>
              <select
                value={form.class}
                onChange={(e) => setForm((f) => ({ ...f, class: e.target.value }))}
                className={selectCls}
              >
                {classes.filter(c => c !== "All Classes").map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block">Performance</Label>
              <select
                value={form.performance}
                onChange={(e) => setForm((f) => ({ ...f, performance: e.target.value as Performance }))}
                className={selectCls}
              >
                {(["Excellent","Good","Average","Poor"] as Performance[]).map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700"
              onClick={handleAdd}
              disabled={!form.name || !form.rollNo}
            >
              Add Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editStudent} onOpenChange={() => setEditStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
          {editStudent && (
            <div className="grid grid-cols-2 gap-4 py-2">
              {[
                { label: "Full Name",    key: "name",       type: "text"   },
                { label: "Roll No",      key: "rollNo",     type: "text"   },
                { label: "Email",        key: "email",      type: "email"  },
                { label: "Phone",        key: "phone",      type: "text"   },
                { label: "Attendance %", key: "attendance", type: "number" },
              ].map(({ label, key, type }) => (
                <div key={key} className={key === "name" || key === "email" ? "col-span-2" : ""}>
                  <Label className="mb-1 block">{label}</Label>
                  <Input
                    type={type}
                    value={(editStudent as any)[key]}
                    onChange={(e) => setEditStudent((s) => s ? { ...s, [key]: e.target.value } : s)}
                  />
                </div>
              ))}
              <div>
                <Label className="mb-1 block">Performance</Label>
                <select
                  value={editStudent.performance}
                  onChange={(e) => setEditStudent((s) => s ? { ...s, performance: e.target.value as Performance } : s)}
                  className={selectCls}
                >
                  {(["Excellent","Good","Average","Poor"] as Performance[]).map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStudent(null)}>Cancel</Button>
            <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteStudent} onOpenChange={() => setDeleteStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Student</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground/70 py-2">
            Are you sure you want to remove <strong>{deleteStudent?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStudent(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove Student</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}