
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  User, Bus, BookOpen, Upload, ChevronRight, ChevronLeft, CheckCircle2,
  AlertCircle, Camera, FileText, Home, Heart, Stethoscope, Shield,
  GraduationCap, Plus, Trash2, Save, School, Users, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createStudent, useStudents } from "@/store/students";
import { useSections } from "@/store/classes";
import type { Student } from "@/types/student";
import { useSectionBase } from "@/lib/section";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Sibling { name: string; class: string; rollNo: string; }

interface FormData {
  firstName: string; middleName: string; lastName: string; dob: string;
  gender: string; bloodGroup: string; nationality: string; religion: string;
  category: string; photo: File | null;
  admissionClass: string; admissionSection: string; admissionDate: string;
  rollNo: string; admissionNo: string; academicYear: string; medium: string;
  presentAddress: string; presentCity: string; presentState: string; presentPincode: string;
  sameAddress: boolean; permanentAddress: string; permanentCity: string;
  permanentState: string; permanentPincode: string; studentPhone: string; studentEmail: string;
  aadharNo: string; panNo: string; birthCertNo: string; casteCertNo: string;
  prevSchoolName: string; prevSchoolBoard: string; prevSchoolCity: string;
  prevClass: string; prevPercentage: string; tcNo: string; tcDate: string; tcReason: string;
  fatherName: string; fatherDob: string; fatherQualification: string; fatherOccupation: string;
  fatherCompany: string; fatherDesignation: string; fatherAnnualIncome: string;
  fatherPhone: string; fatherEmail: string; fatherAadhar: string; fatherPan: string;
  motherName: string; motherDob: string; motherQualification: string; motherOccupation: string;
  motherCompany: string; motherDesignation: string; motherAnnualIncome: string;
  motherPhone: string; motherEmail: string; motherAadhar: string;
  hasGuardian: boolean; guardianName: string; guardianRelation: string; guardianPhone: string;
  guardianEmail: string; guardianAddress: string; guardianOccupation: string;
  hasSiblings: boolean; siblings: Sibling[];
  height: string; weight: string; medicalCondition: string; allergies: string;
  specialNeeds: string; doctorName: string; doctorPhone: string;
  needsTransport: boolean; pickupAddress: string; pickupCity: string; busRoute: string; busStop: string;
  sports: string[]; arts: string[]; otherActivities: string;
  feeCategory: string; concessionType: string; concessionPercent: string; siblingDiscount: boolean;
  docBirthCert: boolean; docAadhar: boolean; docTC: boolean; docMarksheet: boolean;
  docPhotos: boolean; docCasteCert: boolean; docIncomeCert: boolean; docMedicalCert: boolean;
  declarationAccepted: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CLASSES = ["Nursery","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11 (Science)","11 (Commerce)","11 (Arts)","12 (Science)","12 (Commerce)","12 (Arts)"];
const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const BOARDS = ["CBSE","ICSE","State Board","IB","IGCSE","Other"];
const QUALIFICATIONS = ["Below 10th","10th","12th","Graduate","Post Graduate","PhD","Other"];
const OCCUPATIONS = ["Government Service","Private Service","Business","Self Employed","Doctor","Engineer","Lawyer","Teacher","Agriculturist","Housewife","Other"];
const INCOME_SLABS = ["Below ₹1L","₹1L - ₹3L","₹3L - ₹5L","₹5L - ₹10L","₹10L - ₹20L","Above ₹20L"];
const SPORTS_LIST = ["Cricket","Football","Basketball","Volleyball","Badminton","Table Tennis","Swimming","Athletics","Chess","Kabaddi","Kho-Kho","Tennis","Hockey"];
const ARTS_LIST = ["Drawing","Painting","Music (Vocal)","Music (Instrumental)","Dance (Classical)","Dance (Folk)","Theatre","Photography","Crafts","Pottery"];
const RELIGIONS = ["Hindu","Muslim","Christian","Sikh","Buddhist","Jain","Other"];
const CATEGORIES = ["General","OBC","OBC-NCL","SC","ST","EWS"];
const MEDIUMS = ["Hindi","English","Hindi & English"];
const FEE_CATEGORIES = ["Regular","Staff Ward","Management Quota","RTE","Scholarship"];
const CONCESSION_TYPES = ["None","Merit","Need Based","Staff Ward","RTE","Sibling","Ex-Serviceman","Differently Abled"];

const steps = [
  { id: 1,  label: "Basic Info",      icon: User          },
  { id: 2,  label: "Admission",       icon: GraduationCap },
  { id: 3,  label: "Address",         icon: Home          },
  { id: 4,  label: "Documents",       icon: FileText      },
  { id: 5,  label: "Prev School",     icon: School        },
  { id: 6,  label: "Parents",         icon: Users         },
  { id: 7,  label: "Health",          icon: Stethoscope   },
  { id: 8,  label: "Transport",       icon: Bus           },
  { id: 9,  label: "Activities",      icon: BookOpen      },
  { id: 10, label: "Fees & Docs",     icon: Shield        },
];

const emptyForm: FormData = {
  firstName:"",middleName:"",lastName:"",dob:"",gender:"",bloodGroup:"",nationality:"Indian",religion:"",category:"",photo:null,
  admissionClass:"",admissionSection:"",admissionDate:"",rollNo:"",admissionNo:"",academicYear:"2025-26",medium:"",
  presentAddress:"",presentCity:"",presentState:"",presentPincode:"",sameAddress:false,permanentAddress:"",permanentCity:"",permanentState:"",permanentPincode:"",studentPhone:"",studentEmail:"",
  aadharNo:"",panNo:"",birthCertNo:"",casteCertNo:"",
  prevSchoolName:"",prevSchoolBoard:"",prevSchoolCity:"",prevClass:"",prevPercentage:"",tcNo:"",tcDate:"",tcReason:"",
  fatherName:"",fatherDob:"",fatherQualification:"",fatherOccupation:"",fatherCompany:"",fatherDesignation:"",fatherAnnualIncome:"",fatherPhone:"",fatherEmail:"",fatherAadhar:"",fatherPan:"",
  motherName:"",motherDob:"",motherQualification:"",motherOccupation:"",motherCompany:"",motherDesignation:"",motherAnnualIncome:"",motherPhone:"",motherEmail:"",motherAadhar:"",
  hasGuardian:false,guardianName:"",guardianRelation:"",guardianPhone:"",guardianEmail:"",guardianAddress:"",guardianOccupation:"",
  hasSiblings:false,siblings:[],
  height:"",weight:"",medicalCondition:"",allergies:"",specialNeeds:"",doctorName:"",doctorPhone:"",
  needsTransport:false,pickupAddress:"",pickupCity:"",busRoute:"",busStop:"",
  sports:[],arts:[],otherActivities:"",
  feeCategory:"Regular",concessionType:"None",concessionPercent:"",siblingDiscount:false,
  docBirthCert:false,docAadhar:false,docTC:false,docMarksheet:false,docPhotos:false,docCasteCert:false,docIncomeCert:false,docMedicalCert:false,
  declarationAccepted:false,
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-foreground/70 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500
        transition-colors disabled:opacity-50"
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
    >
      {children}
    </select>
  );
}

function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={3}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500
        transition-colors resize-none"
    />
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-3 border-b border-border">
      <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-foreground/50 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ToggleChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-all
        ${selected
          ? "bg-violet-600 border-violet-600 text-white"
          : "bg-background border-border text-foreground/70 hover:border-violet-400"
        }`}
    >
      {label}
    </button>
  );
}

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
          ${checked ? "bg-violet-600 border-violet-600" : "border-border group-hover:border-violet-400"}`}
      >
        {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white stroke-2"><polyline points="1,4 4,7 9,1" /></svg>}
      </div>
      <span className="text-sm text-foreground/80">{label}</span>
    </label>
  );
}

// ── Step Progress Bar ──────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-center gap-1 min-w-max px-1">
        {steps.map((step, i) => {
          const done = step.id < current;
          const active = step.id === current;
          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
                ${active ? "bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900"
                  : done  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                           : "bg-accent/40 text-foreground/40"}`}
              >
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  : <step.icon className="h-3.5 w-3.5 shrink-0" />
                }
                <span className="hidden sm:block">{step.label}</span>
                <span className="sm:hidden">{step.id}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-3 h-px ${done ? "bg-violet-300 dark:bg-violet-700" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function NewStudent() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<Student | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { addStudent } = useStudents();
  // admission is only into classes / sections the school has set up
  const sectionList = useSections();
  const admissionGrades = [...new Set(sectionList.map((sec) => sec.className.replace(/^Classs+/, "")))].sort((a, b) => parseInt(a) - parseInt(b));
  const admissionSections = sectionList.filter((sec) => sec.className === `Class ${form.admissionClass}`).map((sec) => sec.section).sort();

  const set = (field: keyof FormData, value: any) =>
    setForm((p) => ({ ...p, [field]: value }));

  const toggleArr = (field: "sports" | "arts", val: string) => {
    setForm((p) => ({
      ...p,
      [field]: p[field].includes(val)
        ? (p[field] as string[]).filter((x) => x !== val)
        : [...(p[field] as string[]), val],
    }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { set("photo", file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const addSibling = () => set("siblings", [...form.siblings, { name: "", class: "", rollNo: "" }]);
  const removeSibling = (i: number) => set("siblings", form.siblings.filter((_, idx) => idx !== i));
  const updateSibling = (i: number, field: keyof Sibling, val: string) => {
    const arr = [...form.siblings]; arr[i] = { ...arr[i], [field]: val }; set("siblings", arr);
  };

  const syncPermanent = (checked: boolean) => {
    set("sameAddress", checked);
    if (checked) setForm((p) => ({ ...p, sameAddress: true, permanentAddress: p.presentAddress, permanentCity: p.presentCity, permanentState: p.presentState, permanentPincode: p.presentPincode }));
  };

  const handleSubmit = () => {
    if (!form.firstName.trim() || !form.admissionClass || !form.admissionSection) {
      toast.error("Student name, class and section are required.");
      return;
    }
    const name = [form.firstName, form.middleName, form.lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const created = addStudent(createStudent({
      name,
      class: `Class ${form.admissionClass}-${form.admissionSection}`,
      email: form.studentEmail,
      phone: form.studentPhone,
      firstName: form.firstName, middleName: form.middleName, lastName: form.lastName,
      dob: form.dob, gender: form.gender, bloodGroup: form.bloodGroup, bloodGroupHealth: form.bloodGroup,
      nationality: form.nationality, religion: form.religion, category: form.category,
      admissionClass: form.admissionClass, admissionSection: form.admissionSection,
      ...(form.admissionDate && { admissionDate: form.admissionDate }),
      ...(form.admissionNo && { admissionNo: form.admissionNo }),
      rollNo: form.rollNo, academicYear: form.academicYear, medium: form.medium,
      presentAddress: form.presentAddress, presentCity: form.presentCity, presentState: form.presentState, presentPincode: form.presentPincode,
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity, permanentState: form.permanentState, permanentPincode: form.permanentPincode,
      aadharNo: form.aadharNo, birthCertNo: form.birthCertNo,
      prevSchoolName: form.prevSchoolName, prevSchoolBoard: form.prevSchoolBoard, prevClass: form.prevClass,
      prevPercentage: form.prevPercentage, tcNo: form.tcNo,
      fatherName: form.fatherName, fatherOccupation: form.fatherOccupation, fatherPhone: form.fatherPhone,
      fatherEmail: form.fatherEmail, fatherAnnualIncome: form.fatherAnnualIncome,
      motherName: form.motherName, motherOccupation: form.motherOccupation, motherPhone: form.motherPhone, motherEmail: form.motherEmail,
      height: form.height, weight: form.weight, medicalCondition: form.medicalCondition, allergies: form.allergies,
      doctorName: form.doctorName, doctorPhone: form.doctorPhone,
      needsTransport: form.needsTransport, busRoute: form.busRoute, busStop: form.busStop, pickupAddress: form.pickupAddress,
      sports: form.sports, arts: form.arts, otherActivities: form.otherActivities,
      feeCategory: form.feeCategory, concessionType: form.concessionType, concessionPercent: form.concessionPercent,
      docBirthCert: form.docBirthCert, docAadhar: form.docAadhar, docTC: form.docTC,
      docMarksheet: form.docMarksheet, docPhotos: form.docPhotos, docCasteCert: form.docCasteCert,
    }));
    setSaved(created);
    setSubmitted(true);
    toast.success(`${name} admitted successfully!`);
  };
  const isLastStep = step === steps.length;
  const progressPct = Math.round(((step - 1) / (steps.length - 1)) * 100);

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Admission Submitted!</h2>
        <p className="text-foreground/60 text-sm">
          Student <span className="font-medium text-foreground">{form.firstName} {form.lastName}</span>'s
          admission form has been recorded for Class {form.admissionClass} ({form.admissionSection}).
        </p>
        <div className="bg-accent/40 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-foreground/60">Admission No.</span><span className="font-medium">{saved?.admissionNo}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Class</span><span className="font-medium">{form.admissionClass} – {form.admissionSection}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Academic Year</span><span className="font-medium">{form.academicYear}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Transport</span><span className="font-medium">{form.needsTransport ? "Yes" : "No"}</span></div>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => { setForm(emptyForm); setStep(1); setSubmitted(false); setPhotoPreview(null); }}>
            New Admission
          </Button>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => navigate(`${base}/students`)}>
            View Students
          </Button>
        </div>
      </div>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      case 1: return (
        <div className="space-y-7">
          <SectionTitle icon={User} title="Student Basic Information" subtitle="Personal details of the student seeking admission" />

          {/* Photo Upload */}
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              {photoPreview
                ? <img src={photoPreview} className="w-28 h-28 rounded-xl object-cover border-2 border-violet-300 dark:border-violet-500/30" />
                : <div className="w-28 h-28 rounded-xl bg-accent border-2 border-dashed border-border flex flex-col items-center justify-center text-foreground/30">
                    <Camera className="h-7 w-7" />
                    <span className="text-[10px] mt-1">Photo</span>
                  </div>
              }
              <label className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center cursor-pointer shadow">
                <Upload className="h-3.5 w-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            </div>
            <div className="text-sm text-foreground/60 space-y-1">
              <p className="font-medium text-foreground/80">Student Photograph</p>
              <p>Upload recent passport-size photo</p>
              <p className="text-xs">JPG/PNG, max 2MB, white background preferred</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Label required>First Name</Label><Input placeholder="Rahul" value={form.firstName} onChange={e => set("firstName", e.target.value)} /></div>
            <div><Label>Middle Name</Label><Input placeholder="Kumar" value={form.middleName} onChange={e => set("middleName", e.target.value)} /></div>
            <div><Label required>Last Name</Label><Input placeholder="Sharma" value={form.lastName} onChange={e => set("lastName", e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Label required>Date of Birth</Label><Input type="date" value={form.dob} onChange={e => set("dob", e.target.value)} /></div>
            <div><Label required>Gender</Label>
              <Select value={form.gender} onChange={e => set("gender", e.target.value)}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </Select>
            </div>
            <div><Label>Blood Group</Label>
              <Select value={form.bloodGroup} onChange={e => set("bloodGroup", e.target.value)}>
                <option value="">Select</option>{BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Label>Nationality</Label><Input value={form.nationality} onChange={e => set("nationality", e.target.value)} /></div>
            <div><Label>Religion</Label>
              <Select value={form.religion} onChange={e => set("religion", e.target.value)}>
                <option value="">Select</option>{RELIGIONS.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <div><Label>Category</Label>
              <Select value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="">Select</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label>Mobile Number</Label>
              <div className="flex">
                <span className="flex items-center px-3 bg-accent border border-r-0 border-border rounded-l-lg text-sm text-foreground/60">+91</span>
                <Input placeholder="9876543210" value={form.studentPhone} onChange={e => set("studentPhone", e.target.value)} className="rounded-l-none" />
              </div>
            </div>
            <div><Label>Email (optional)</Label><Input type="email" placeholder="student@email.com" value={form.studentEmail} onChange={e => set("studentEmail", e.target.value)} /></div>
          </div>
        </div>
      );

      case 2: return (
        <div className="space-y-6">
          <SectionTitle icon={GraduationCap} title="Admission Details" subtitle="Class, section, and enrollment specifics" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div><Label required>Admission to Class</Label>
              <Select value={form.admissionClass} onChange={e => set("admissionClass", e.target.value)}>
                <option value="">Select Class</option>{admissionGrades.map(c => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div><Label required>Section</Label>
              <Select value={form.admissionSection} onChange={e => set("admissionSection", e.target.value)}>
                <option value="">Section</option>{admissionSections.map(s => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div><Label>Academic Year</Label>
              <Select value={form.academicYear} onChange={e => set("academicYear", e.target.value)}>
                <option>2025-26</option><option>2026-27</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div><Label required>Admission Date</Label><Input type="date" value={form.admissionDate} onChange={e => set("admissionDate", e.target.value)} /></div>
            <div><Label>Admission No.</Label><Input placeholder="Auto-generated" value={form.admissionNo} onChange={e => set("admissionNo", e.target.value)} /></div>
            <div><Label>Roll No.</Label><Input placeholder="Assigned later" value={form.rollNo} onChange={e => set("rollNo", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>Medium of Instruction</Label>
              <Select value={form.medium} onChange={e => set("medium", e.target.value)}>
                <option value="">Select</option>{MEDIUMS.map(m => <option key={m}>{m}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-300">RTE Admission</p>
              <p className="text-blue-600/80 dark:text-blue-400 text-xs mt-0.5">For Right to Education admissions, select "RTE" in Fee Category on the Fees step. RTE seats are limited per class.</p>
            </div>
          </div>
        </div>
      );

      case 3: return (
        <div className="space-y-6">
          <SectionTitle icon={Home} title="Contact & Address" subtitle="Present and permanent address of the student" />
          <div><Label required>Present Address</Label><Textarea placeholder="House No., Street, Area..." value={form.presentAddress} onChange={e => set("presentAddress", e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div><Label>City</Label><Input placeholder="Lucknow" value={form.presentCity} onChange={e => set("presentCity", e.target.value)} /></div>
            <div><Label>State</Label><Input placeholder="Uttar Pradesh" value={form.presentState} onChange={e => set("presentState", e.target.value)} /></div>
            <div><Label>PIN Code</Label><Input placeholder="226001" maxLength={6} value={form.presentPincode} onChange={e => set("presentPincode", e.target.value)} /></div>
          </div>
          <div className="pt-1">
            <CheckBox checked={form.sameAddress} onChange={syncPermanent} label="Permanent address same as present address" />
          </div>
          {!form.sameAddress && (
            <>
              <div className="border-t border-border pt-5">
                <Label>Permanent Address</Label>
                <Textarea placeholder="House No., Street, Area..." value={form.permanentAddress} onChange={e => set("permanentAddress", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                <div><Label>City</Label><Input placeholder="City" value={form.permanentCity} onChange={e => set("permanentCity", e.target.value)} /></div>
                <div><Label>State</Label><Input placeholder="State" value={form.permanentState} onChange={e => set("permanentState", e.target.value)} /></div>
                <div><Label>PIN Code</Label><Input placeholder="000000" maxLength={6} value={form.permanentPincode} onChange={e => set("permanentPincode", e.target.value)} /></div>
              </div>
            </>
          )}
        </div>
      );

      case 4: return (
        <div className="space-y-6">
          <SectionTitle icon={FileText} title="Identity & Documents" subtitle="Government issued ID numbers for the student" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label>Aadhar Card No.</Label>
              <Input placeholder="XXXX XXXX XXXX" maxLength={14} value={form.aadharNo} onChange={e => set("aadharNo", e.target.value)} />
              <p className="text-xs text-foreground/40 mt-1">12-digit Aadhar number</p>
            </div>
            <div>
              <Label>PAN Card No.</Label>
              <Input placeholder="ABCDE1234F" maxLength={10} value={form.panNo} onChange={e => set("panNo", e.target.value.toUpperCase())} />
              <p className="text-xs text-foreground/40 mt-1">Parent's PAN (for fee receipts)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>Birth Certificate No.</Label><Input placeholder="BC-XXXX-XXXXX" value={form.birthCertNo} onChange={e => set("birthCertNo", e.target.value)} /></div>
            <div><Label>Caste Certificate No.</Label><Input placeholder="Leave blank if N/A" value={form.casteCertNo} onChange={e => set("casteCertNo", e.target.value)} /></div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Data Privacy Notice
            </p>
            <p className="text-amber-600/80 dark:text-amber-400 text-xs mt-1">All document numbers are stored encrypted and used only for official school records, government reporting, and fee documentation as required by law.</p>
          </div>
        </div>
      );

      case 5: return (
        <div className="space-y-6">
          <SectionTitle icon={School} title="Previous School Details" subtitle="Last school attended (skip if new admission / nursery)" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>Previous School Name</Label><Input placeholder="Delhi Public School, Varanasi" value={form.prevSchoolName} onChange={e => set("prevSchoolName", e.target.value)} /></div>
            <div><Label>Board / Affiliation</Label>
              <Select value={form.prevSchoolBoard} onChange={e => set("prevSchoolBoard", e.target.value)}>
                <option value="">Select Board</option>{BOARDS.map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div><Label>School City</Label><Input placeholder="City" value={form.prevSchoolCity} onChange={e => set("prevSchoolCity", e.target.value)} /></div>
            <div><Label>Last Class Attended</Label>
              <Select value={form.prevClass} onChange={e => set("prevClass", e.target.value)}>
                <option value="">Select</option>{CLASSES.map(c => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div><Label>Last Year %</Label><Input placeholder="e.g. 85.4" value={form.prevPercentage} onChange={e => set("prevPercentage", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Label>Transfer Certificate No.</Label><Input placeholder="TC-XXXX" value={form.tcNo} onChange={e => set("tcNo", e.target.value)} /></div>
            <div><Label>TC Issue Date</Label><Input type="date" value={form.tcDate} onChange={e => set("tcDate", e.target.value)} /></div>
            <div><Label>Reason for Leaving</Label><Input placeholder="Relocation / Upgrade" value={form.tcReason} onChange={e => set("tcReason", e.target.value)} /></div>
          </div>
        </div>
      );

      case 6: return (
        <div className="space-y-7">
          {/* Father */}
          <div>
            <SectionTitle icon={Users} title="Father's Details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><Label required>Father's Full Name</Label><Input placeholder="Ramesh Kumar Sharma" value={form.fatherName} onChange={e => set("fatherName", e.target.value)} /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={form.fatherDob} onChange={e => set("fatherDob", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
              <div><Label>Qualification</Label><Select value={form.fatherQualification} onChange={e => set("fatherQualification", e.target.value)}><option value="">Select</option>{QUALIFICATIONS.map(q=><option key={q}>{q}</option>)}</Select></div>
              <div><Label>Occupation</Label><Select value={form.fatherOccupation} onChange={e => set("fatherOccupation", e.target.value)}><option value="">Select</option>{OCCUPATIONS.map(o=><option key={o}>{o}</option>)}</Select></div>
              <div><Label>Company / Employer</Label><Input placeholder="Company name" value={form.fatherCompany} onChange={e => set("fatherCompany", e.target.value)} /></div>
              <div><Label>Designation</Label><Input placeholder="Designation" value={form.fatherDesignation} onChange={e => set("fatherDesignation", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div><Label>Annual Income</Label><Select value={form.fatherAnnualIncome} onChange={e => set("fatherAnnualIncome", e.target.value)}><option value="">Select</option>{INCOME_SLABS.map(i=><option key={i}>{i}</option>)}</Select></div>
              <div><Label required>Phone No.</Label><Input placeholder="9876543210" value={form.fatherPhone} onChange={e => set("fatherPhone", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" placeholder="father@email.com" value={form.fatherEmail} onChange={e => set("fatherEmail", e.target.value)} /></div>
              <div><Label>Aadhar No.</Label><Input placeholder="XXXX XXXX XXXX" value={form.fatherAadhar} onChange={e => set("fatherAadhar", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
              <div><Label>PAN Card No.</Label><Input placeholder="ABCDE1234F" value={form.fatherPan} onChange={e => set("fatherPan", e.target.value.toUpperCase())} /></div>
            </div>
          </div>

          {/* Mother */}
          <div className="border-t border-border pt-6">
            <SectionTitle icon={Heart} title="Mother's Details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><Label required>Mother's Full Name</Label><Input placeholder="Sunita Sharma" value={form.motherName} onChange={e => set("motherName", e.target.value)} /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={form.motherDob} onChange={e => set("motherDob", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
              <div><Label>Qualification</Label><Select value={form.motherQualification} onChange={e => set("motherQualification", e.target.value)}><option value="">Select</option>{QUALIFICATIONS.map(q=><option key={q}>{q}</option>)}</Select></div>
              <div><Label>Occupation</Label><Select value={form.motherOccupation} onChange={e => set("motherOccupation", e.target.value)}><option value="">Select</option>{OCCUPATIONS.map(o=><option key={o}>{o}</option>)}</Select></div>
              <div><Label>Company / Employer</Label><Input placeholder="Company name" value={form.motherCompany} onChange={e => set("motherCompany", e.target.value)} /></div>
              <div><Label>Annual Income</Label><Select value={form.motherAnnualIncome} onChange={e => set("motherAnnualIncome", e.target.value)}><option value="">Select</option>{INCOME_SLABS.map(i=><option key={i}>{i}</option>)}</Select></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 mt-4">
              <div><Label required>Phone No.</Label><Input placeholder="9876543210" value={form.motherPhone} onChange={e => set("motherPhone", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" placeholder="mother@email.com" value={form.motherEmail} onChange={e => set("motherEmail", e.target.value)} /></div>
              <div><Label>Aadhar No.</Label><Input placeholder="XXXX XXXX XXXX" value={form.motherAadhar} onChange={e => set("motherAadhar", e.target.value)} /></div>
            </div>
          </div>

          {/* Siblings */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-foreground">Siblings Already Enrolled in This School</p>
              <CheckBox checked={form.hasSiblings} onChange={v => set("hasSiblings", v)} label="Yes, has sibling(s)" />
            </div>
            {form.hasSiblings && (
              <div className="space-y-3">
                {form.siblings.map((sib, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 items-end">
                    <div><Label>Sibling Name</Label><Input placeholder="Name" value={sib.name} onChange={e => updateSibling(i,"name",e.target.value)} /></div>
                    <div><Label>Class</Label><Select value={sib.class} onChange={e => updateSibling(i,"class",e.target.value)}><option value="">Class</option>{CLASSES.map(c=><option key={c}>{c}</option>)}</Select></div>
                    <div className="flex gap-2">
                      <div className="flex-1"><Label>Roll No.</Label><Input placeholder="Roll" value={sib.rollNo} onChange={e => updateSibling(i,"rollNo",e.target.value)} /></div>
                      <button onClick={() => removeSibling(i)} className="mb-0.5 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
                <button onClick={addSibling} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium mt-2">
                  <Plus className="h-4 w-4" /> Add Sibling
                </button>
              </div>
            )}
          </div>

          {/* Guardian */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-foreground">Local Guardian (if parents not in city)</p>
              <CheckBox checked={form.hasGuardian} onChange={v => set("hasGuardian", v)} label="Has local guardian" />
            </div>
            {form.hasGuardian && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  <div><Label>Guardian Name</Label><Input value={form.guardianName} onChange={e => set("guardianName", e.target.value)} /></div>
                  <div><Label>Relation</Label><Input placeholder="Uncle / Aunt / etc." value={form.guardianRelation} onChange={e => set("guardianRelation", e.target.value)} /></div>
                  <div><Label>Phone</Label><Input value={form.guardianPhone} onChange={e => set("guardianPhone", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><Label>Address</Label><Textarea value={form.guardianAddress} onChange={e => set("guardianAddress", e.target.value)} /></div>
                  <div><Label>Occupation</Label><Input value={form.guardianOccupation} onChange={e => set("guardianOccupation", e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>
        </div>
      );

      case 7: return (
        <div className="space-y-6">
          <SectionTitle icon={Stethoscope} title="Health Information" subtitle="Medical details help us care for your child better" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div><Label>Height (cm)</Label><Input type="number" placeholder="120" value={form.height} onChange={e => set("height", e.target.value)} /></div>
            <div><Label>Weight (kg)</Label><Input type="number" placeholder="25" value={form.weight} onChange={e => set("weight", e.target.value)} /></div>
            <div><Label>Doctor's Name</Label><Input placeholder="Dr. Verma" value={form.doctorName} onChange={e => set("doctorName", e.target.value)} /></div>
            <div><Label>Doctor's Phone</Label><Input placeholder="9876543210" value={form.doctorPhone} onChange={e => set("doctorPhone", e.target.value)} /></div>
          </div>
          <div><Label>Known Medical Conditions</Label><Textarea placeholder="Asthma, Diabetes, Heart condition... (leave blank if none)" value={form.medicalCondition} onChange={e => set("medicalCondition", e.target.value)} /></div>
          <div><Label>Known Allergies</Label><Textarea placeholder="Food allergies, dust, medicine allergies... (leave blank if none)" value={form.allergies} onChange={e => set("allergies", e.target.value)} /></div>
          <div><Label>Special Needs / Differently Abled</Label><Textarea placeholder="Visual impairment, hearing impairment, learning disability... (leave blank if none)" value={form.specialNeeds} onChange={e => set("specialNeeds", e.target.value)} /></div>
        </div>
      );

      case 8: return (
        <div className="space-y-6">
          <SectionTitle icon={Bus} title="Transport Facility" subtitle="School bus / van service details" />
          <div className="flex items-center gap-6">
            <p className="text-sm font-medium text-foreground">Does the student require school transport?</p>
            <div className="flex gap-3">
              {["Yes","No"].map(opt => (
                <button key={opt} type="button" onClick={() => set("needsTransport", opt === "Yes")}
                  className={`px-5 py-2 rounded-lg text-sm font-medium border transition-all
                    ${(form.needsTransport && opt === "Yes") || (!form.needsTransport && opt === "No")
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "bg-background border-border text-foreground/70 hover:border-violet-400"
                    }`}>{opt}
                </button>
              ))}
            </div>
          </div>
          {form.needsTransport && (
            <div className="space-y-5 pt-2 border-t border-border">
              <div><Label required>Pickup Address</Label><Textarea placeholder="House No., Street, Area for pickup..." value={form.pickupAddress} onChange={e => set("pickupAddress", e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><Label>City</Label><Input placeholder="Lucknow" value={form.pickupCity} onChange={e => set("pickupCity", e.target.value)} /></div>
                <div><Label>Bus Route No.</Label><Input placeholder="Route 5A" value={form.busRoute} onChange={e => set("busRoute", e.target.value)} /></div>
                <div><Label>Nearest Bus Stop</Label><Input placeholder="Hazratganj" value={form.busStop} onChange={e => set("busStop", e.target.value)} /></div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300">
                Transport charges will be added to the fee structure based on the assigned route. Route allocation subject to availability.
              </div>
            </div>
          )}
        </div>
      );

      case 9: return (
        <div className="space-y-7">
          <SectionTitle icon={BookOpen} title="Extra-Curricular Activities" subtitle="Sports, arts and other interests of the student" />
          <div>
            <Label>Sports Interests</Label>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {SPORTS_LIST.map(s => <ToggleChip key={s} label={s} selected={form.sports.includes(s)} onToggle={() => toggleArr("sports", s)} />)}
            </div>
          </div>
          <div>
            <Label>Arts & Culture</Label>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {ARTS_LIST.map(a => <ToggleChip key={a} label={a} selected={form.arts.includes(a)} onToggle={() => toggleArr("arts", a)} />)}
            </div>
          </div>
          <div><Label>Other Activities / Achievements</Label>
            <Textarea placeholder="National level competitions, awards, scouting, NCC, NSS, robotics club..." value={form.otherActivities} onChange={e => set("otherActivities", e.target.value)} />
          </div>
        </div>
      );

      case 10: return (
        <div className="space-y-7">
          <div>
            <SectionTitle icon={Shield} title="Fee & Concession" subtitle="Applicable fee category and any concessions" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <div><Label>Fee Category</Label><Select value={form.feeCategory} onChange={e => set("feeCategory", e.target.value)}>{FEE_CATEGORIES.map(f=><option key={f}>{f}</option>)}</Select></div>
              <div><Label>Concession Type</Label><Select value={form.concessionType} onChange={e => set("concessionType", e.target.value)}>{CONCESSION_TYPES.map(c=><option key={c}>{c}</option>)}</Select></div>
              {form.concessionType !== "None" && (
                <div><Label>Concession %</Label><Input placeholder="10" type="number" min="0" max="100" value={form.concessionPercent} onChange={e => set("concessionPercent", e.target.value)} /></div>
              )}
            </div>
            {form.hasSiblings && (
              <div className="mt-4">
                <CheckBox checked={form.siblingDiscount} onChange={v => set("siblingDiscount", v)} label="Apply sibling discount (school policy: 10% for 2nd child, 15% for 3rd+)" />
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6">
            <SectionTitle icon={FileText} title="Documents Submitted" subtitle="Tick all documents physically received at the time of admission" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ["docBirthCert",  "Birth Certificate (Original + Photocopy)"],
                ["docAadhar",     "Aadhar Card of Student & Parents"],
                ["docTC",         "Transfer Certificate from Previous School"],
                ["docMarksheet",  "Last Year Mark Sheet / Report Card"],
                ["docPhotos",     "Passport Size Photographs (4 copies)"],
                ["docCasteCert",  "Caste Certificate (if applicable)"],
                ["docIncomeCert", "Income Certificate (if seeking concession)"],
                ["docMedicalCert","Medical / Fitness Certificate"],
              ].map(([field, label]) => (
                <CheckBox key={field} checked={form[field as keyof FormData] as boolean} onChange={(v) => set(field as keyof FormData, v)} label={label} />
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="p-5 rounded-xl bg-accent/40 border border-border text-sm text-foreground/70 space-y-2 leading-relaxed">
              <p className="font-semibold text-foreground">Declaration by Parent / Guardian</p>
              <p>I hereby declare that all the information furnished in this admission form is true and correct to the best of my knowledge. I agree to abide by the rules and regulations of the school. I understand that any false information may result in cancellation of admission.</p>
              <p>I also consent to the school collecting, storing, and using the personal and sensitive data provided herein for the purposes of education, administration, and regulatory compliance only.</p>
            </div>
            <div className="mt-4">
              <CheckBox checked={form.declarationAccepted} onChange={(v) => set("declarationAccepted", v)} label="I have read, understood, and accept the above declaration on behalf of the student." />
            </div>
          </div>
        </div>
      );

      default: return null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6 p-6">

      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">New Student Admission</h1>
          <p className="text-muted-foreground mt-1">Academic Year {form.academicYear} — Fill all required fields marked with *</p>
        </div>
        <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 text-sm px-4 py-1.5">
          Step {step} of {steps.length}
        </Badge>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <StepBar current={step} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-accent overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-foreground/50 shrink-0">{progressPct}% complete</span>
          </div>
        </CardContent>
      </Card>

      {/* Form Card */}
      <Card>
        <CardContent className="p-10">
          {renderStep()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between pb-10">
        <Button
          variant="outline"
          onClick={() => setStep((p) => Math.max(1, p - 1))}
          disabled={step === 1}
          className="gap-2 px-6 py-5 text-base"
        >
          <ChevronLeft className="h-5 w-5" /> Previous
        </Button>

        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-foreground/60 px-6 py-5 text-base">
            <Save className="h-5 w-5" /> Save Draft
          </Button>

          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={!form.declarationAccepted}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-5 text-base"
            >
              <CheckCircle2 className="h-5 w-5" /> Submit Admission
            </Button>
          ) : (
            <Button
              onClick={() => setStep((p) => Math.min(steps.length, p + 1))}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-5 text-base"
            >
              Next <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}