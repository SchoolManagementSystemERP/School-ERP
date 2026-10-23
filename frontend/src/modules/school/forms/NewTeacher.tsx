// src/app/pages/principal/NewTeacher.tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  User, BookOpen, Upload, ChevronRight, ChevronLeft, CheckCircle2,
  Camera, FileText, Home, Stethoscope, Shield,
  GraduationCap, Save, Users, Banknote, Briefcase,
  Phone, Mail, Heart, Award, Building2, CalendarDays,
  AlertCircle, Plus, Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nextEmpId, useTeachers } from "@/store/teachers";
import type { EmploymentType, Teacher } from "@/types/teacher";
import { useSectionBase } from "@/lib/section";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Qualification {
  degree: string;
  institute: string;
  board: string;
  year: string;
  percentage: string;
}

interface Experience {
  schoolName: string;
  designation: string;
  from: string;
  to: string;
  reasonLeaving: string;
}

interface FormData {
  // Step 1 — Personal
  firstName: string; middleName: string; lastName: string;
  dob: string; gender: string; bloodGroup: string;
  nationality: string; religion: string; category: string;
  maritalStatus: string; photo: File | null;
  phone: string; alternatePhone: string; email: string; personalEmail: string;
  aadharNo: string; panNo: string;

  // Step 2 — Professional
  employeeId: string; designation: string; department: string;
  subjectsTaught: string[]; classesHandled: string[];
  joiningDate: string; employmentType: string; academicYear: string;
  medium: string; reportingTo: string;

  // Step 3 — Address
  presentAddress: string; presentCity: string; presentState: string; presentPincode: string;
  sameAddress: boolean;
  permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string;

  // Step 4 — Qualifications
  qualifications: Qualification[];
  hasBEd: boolean; bEdInstitute: string; bEdYear: string; bEdPercent: string;
  hasTET: boolean; tetLevel: string; tetScore: string; tetYear: string;
  hasCTET: boolean; ctetPaper: string; ctetScore: string; ctetYear: string;
  otherCerts: string;

  // Step 5 — Experience
  totalExperience: string;
  experiences: Experience[];

  // Step 6 — Family
  fatherName: string; fatherOccupation: string; fatherPhone: string;
  motherName: string; motherOccupation: string;
  spouseName: string; spouseOccupation: string; spousePhone: string;
  emergencyContact: string; emergencyRelation: string; emergencyPhone: string;
  children: string;

  // Step 7 — Bank & Salary
  bankName: string; accountNo: string; ifscCode: string; branchName: string;
  accountType: string; salaryGrade: string; basicSalary: string;
  hra: string; da: string; ta: string; otherAllowances: string;
  pfNo: string; esiNo: string; gpfNo: string;

  // Step 8 — Health
  height: string; weight: string;
  medicalCondition: string; allergies: string; specialNeeds: string;
  doctorName: string; doctorPhone: string;
  physicallyHandicapped: boolean; handicapType: string; handicapPercent: string;

  // Step 9 — Documents
  docAadhar: boolean; docPan: boolean; docDegree: boolean; docBEd: boolean;
  docTET: boolean; docExperience: boolean; docCaste: boolean;
  docResidence: boolean; docPassport: boolean; docMedical: boolean;
  docPoliceVerification: boolean;

  // Step 10 — Declaration
  declarationAccepted: boolean;
  joiningRemarks: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const RELIGIONS = ["Hindu","Muslim","Christian","Sikh","Buddhist","Jain","Other"];
const CATEGORIES = ["General","OBC","OBC-NCL","SC","ST","EWS"];
const DESIGNATIONS = ["PRT (Primary Teacher)","TGT (Trained Graduate Teacher)","PGT (Post Graduate Teacher)","Lecturer","HOD","Vice Principal","Principal","Lab Assistant","Sports Teacher","Art Teacher","Music Teacher","Counselor","Librarian","Computer Teacher"];
const DEPARTMENTS = ["Primary (1-5)","Middle (6-8)","Secondary (9-10)","Senior Secondary (11-12)","Administration","Sports","Arts","Co-curricular"];
const SUBJECTS = ["Mathematics","Physics","Chemistry","Biology","English","Hindi","Bengali","History","Geography","Computer Science","Art","Music","Physical Education","Science","Economics","Accountancy","Business Studies","Political Science","Sociology","Psychology","Sanskrit","French","German"];
const CLASSES_LIST = ["Nursery","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11","12"];
const EMPLOYMENT_TYPES = ["Permanent","Probation","Contract","Part-Time","Guest Faculty","Ad-Hoc"];
const MEDIUMS = ["Hindi","English","Hindi & English"];
const ACCOUNT_TYPES = ["Savings","Current"];
const SALARY_GRADES = ["Grade Pay 2000","Grade Pay 2400","Grade Pay 2800","Grade Pay 4200","Grade Pay 4600","Grade Pay 4800","Grade Pay 5400"];
const MARITAL_STATUS = ["Single","Married","Divorced","Widowed"];
const TET_LEVELS = ["Level 1 (Class 1-5)","Level 2 (Class 6-8)","Both"];
const CTET_PAPERS = ["Paper I (Class 1-5)","Paper II (Class 6-8)","Both"];
const DEGREE_BOARDS = ["University","CBSE","ICSE","State Board","IB","IGCSE","Other"];

const steps = [
  { id: 1,  label: "Personal",       icon: User         },
  { id: 2,  label: "Professional",   icon: Briefcase    },
  { id: 3,  label: "Address",        icon: Home         },
  { id: 4,  label: "Qualifications", icon: GraduationCap},
  { id: 5,  label: "Experience",     icon: Award        },
  { id: 6,  label: "Family",         icon: Users        },
  { id: 7,  label: "Bank & Salary",  icon: Banknote     },
  { id: 8,  label: "Health",         icon: Stethoscope  },
  { id: 9,  label: "Documents",      icon: FileText     },
  { id: 10, label: "Declaration",    icon: Shield       },
];

const emptyQualification: Qualification = { degree: "", institute: "", board: "", year: "", percentage: "" };
const emptyExperience: Experience = { schoolName: "", designation: "", from: "", to: "", reasonLeaving: "" };

const emptyForm: FormData = {
  firstName:"",middleName:"",lastName:"",dob:"",gender:"",bloodGroup:"",nationality:"Indian",religion:"",category:"",maritalStatus:"",photo:null,
  phone:"",alternatePhone:"",email:"",personalEmail:"",aadharNo:"",panNo:"",
  employeeId:"",designation:"",department:"",subjectsTaught:[],classesHandled:[],joiningDate:"",employmentType:"",academicYear:"2025-26",medium:"",reportingTo:"",
  presentAddress:"",presentCity:"",presentState:"",presentPincode:"",sameAddress:false,permanentAddress:"",permanentCity:"",permanentState:"",permanentPincode:"",
  qualifications:[{ ...emptyQualification }],hasBEd:false,bEdInstitute:"",bEdYear:"",bEdPercent:"",hasTET:false,tetLevel:"",tetScore:"",tetYear:"",hasCTET:false,ctetPaper:"",ctetScore:"",ctetYear:"",otherCerts:"",
  totalExperience:"",experiences:[],
  fatherName:"",fatherOccupation:"",fatherPhone:"",motherName:"",motherOccupation:"",spouseName:"",spouseOccupation:"",spousePhone:"",emergencyContact:"",emergencyRelation:"",emergencyPhone:"",children:"",
  bankName:"",accountNo:"",ifscCode:"",branchName:"",accountType:"Savings",salaryGrade:"",basicSalary:"",hra:"",da:"",ta:"",otherAllowances:"",pfNo:"",esiNo:"",gpfNo:"",
  height:"",weight:"",medicalCondition:"",allergies:"",specialNeeds:"",doctorName:"",doctorPhone:"",physicallyHandicapped:false,handicapType:"",handicapPercent:"",
  docAadhar:false,docPan:false,docDegree:false,docBEd:false,docTET:false,docExperience:false,docCaste:false,docResidence:false,docPassport:false,docMedical:false,docPoliceVerification:false,
  declarationAccepted:false,joiningRemarks:"",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Lbl({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-foreground/70 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500
        transition-colors disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground
        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
    >{children}</select>
  );
}

function Txta(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} rows={props.rows ?? 3}
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
    <button type="button" onClick={onToggle}
      className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-all
        ${selected ? "bg-violet-600 border-violet-600 text-white" : "bg-background border-border text-foreground/70 hover:border-violet-400"}`}
    >{label}</button>
  );
}

function ChkBox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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

function InfoBox({ type, children }: { type: "info" | "warning"; children: React.ReactNode }) {
  const styles = type === "info"
    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300";
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${styles}`}>
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// ── Step Bar ───────────────────────────────────────────────────────────────────

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

export function NewTeacher() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<Teacher | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { addTeacher } = useTeachers();

  const set = (field: keyof FormData, value: any) =>
    setForm((p) => ({ ...p, [field]: value }));

  const toggleArr = (field: "subjectsTaught" | "classesHandled", val: string) => {
    setForm((p) => ({
      ...p,
      [field]: (p[field] as string[]).includes(val)
        ? (p[field] as string[]).filter((x) => x !== val)
        : [...(p[field] as string[]), val],
    }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { set("photo", file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  // Qualifications
  const addQual = () => set("qualifications", [...form.qualifications, { ...emptyQualification }]);
  const removeQual = (i: number) => set("qualifications", form.qualifications.filter((_, idx) => idx !== i));
  const updateQual = (i: number, field: keyof Qualification, val: string) => {
    const arr = [...form.qualifications]; arr[i] = { ...arr[i], [field]: val }; set("qualifications", arr);
  };

  // Experiences
  const addExp = () => set("experiences", [...form.experiences, { ...emptyExperience }]);
  const removeExp = (i: number) => set("experiences", form.experiences.filter((_, idx) => idx !== i));
  const updateExp = (i: number, field: keyof Experience, val: string) => {
    const arr = [...form.experiences]; arr[i] = { ...arr[i], [field]: val }; set("experiences", arr);
  };

  const syncPermanent = (checked: boolean) => {
    set("sameAddress", checked);
    if (checked) setForm((p) => ({ ...p, sameAddress: true, permanentAddress: p.presentAddress, permanentCity: p.presentCity, permanentState: p.presentState, permanentPincode: p.presentPincode }));
  };

  const handleSubmit = () => {
    if (!form.declarationAccepted) { toast.error("Please accept the declaration to proceed."); return; }
    if (!form.firstName.trim()) { toast.error("Teacher's first name is required."); return; }

    const name = [form.firstName, form.middleName, form.lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const created = addTeacher({
      empId: form.employeeId || nextEmpId(),
      name,
      initials: name.split(" ").slice(-2).map((n) => n[0]).join("").toUpperCase(),
      gender: form.gender, dob: form.dob, bloodGroup: form.bloodGroup,
      phone: form.phone, alternatePhone: form.alternatePhone, email: form.email, personalEmail: form.personalEmail,
      address: form.presentAddress, city: form.presentCity, state: form.presentState, pincode: form.presentPincode,
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity,
      permanentState: form.permanentState, permanentPincode: form.permanentPincode,
      aadhar: form.aadharNo, pan: form.panNo,
      nationality: form.nationality, religion: form.religion, category: form.category, maritalStatus: form.maritalStatus,
      fatherName: form.fatherName, fatherOccupation: form.fatherOccupation, fatherPhone: form.fatherPhone,
      motherName: form.motherName, motherOccupation: form.motherOccupation,
      spouseName: form.spouseName, spouseOccupation: form.spouseOccupation, spousePhone: form.spousePhone,
      children: form.children,
      emergencyContact: form.emergencyContact, emergencyRelation: form.emergencyRelation, emergencyPhone: form.emergencyPhone,
      designation: form.designation, department: form.department,
      positions: ["Subject Teacher"], classTeacherOf: "",
      classSubjects: form.classesHandled.map((className) => ({ className, subjects: [...form.subjectsTaught] })),
      joiningDate: form.joiningDate,
      employmentType: (form.employmentType || "Permanent") as EmploymentType,
      experience: form.totalExperience, totalExperience: form.totalExperience,
      reportingTo: form.reportingTo, academicYear: form.academicYear, medium: form.medium,
      highestQualification: form.qualifications.filter((q) => q.degree).at(-1)?.degree ?? "",
      qualifications: form.qualifications.filter((q) => q.degree),
      bEd: form.hasBEd, bEdInstitute: form.bEdInstitute, bEdYear: form.bEdYear, bEdPercent: form.bEdPercent,
      tet: form.hasTET, tetLevel: form.tetLevel, tetScore: form.tetScore, tetYear: form.tetYear,
      ctet: form.hasCTET, ctetPaper: form.ctetPaper, ctetScore: form.ctetScore, ctetYear: form.ctetYear,
      otherCerts: form.otherCerts,
      experiences: form.experiences.filter((e) => e.schoolName),
      bankName: form.bankName, accountNo: form.accountNo, ifscCode: form.ifscCode, branchName: form.branchName,
      accountType: form.accountType, basicSalary: form.basicSalary, hra: form.hra, da: form.da, ta: form.ta,
      otherAllowances: form.otherAllowances, salaryGrade: form.salaryGrade,
      pfNo: form.pfNo, esiNo: form.esiNo, gpfNo: form.gpfNo,
      height: form.height, weight: form.weight, bloodGroupHealth: form.bloodGroup,
      medicalCondition: form.medicalCondition, allergies: form.allergies, specialNeeds: form.specialNeeds,
      doctorName: form.doctorName, doctorPhone: form.doctorPhone,
      physicallyHandicapped: form.physicallyHandicapped, handicapType: form.handicapType, handicapPercent: form.handicapPercent,
      docAadhar: form.docAadhar, docPan: form.docPan, docDegree: form.docDegree, docBEd: form.docBEd,
      docTET: form.docTET, docExperience: form.docExperience, docCaste: form.docCaste,
      docResidence: form.docResidence, docPassport: form.docPassport, docMedical: form.docMedical,
      docPoliceVerification: form.docPoliceVerification,
      status: "Active",
    });
    setSaved(created);
    setSubmitted(true);
    toast.success("Teacher profile created successfully!");
  };

  const isLastStep = step === steps.length;
  const progressPct = Math.round(((step - 1) / (steps.length - 1)) * 100);

  // ── Success Screen ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4 p-6">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Teacher Added Successfully!</h2>
        <p className="text-foreground/60 text-sm">
          <span className="font-medium text-foreground">{form.firstName} {form.lastName}</span> has been registered
          as <span className="font-medium text-foreground">{form.designation || "Teacher"}</span> in {form.department || "the school"}.
        </p>
        <div className="bg-accent/40 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-foreground/60">Employee ID</span><span className="font-medium">{saved?.empId}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Department</span><span className="font-medium">{form.department}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Joining Date</span><span className="font-medium">{form.joiningDate || "—"}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Employment Type</span><span className="font-medium">{form.employmentType}</span></div>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => { setForm(emptyForm); setStep(1); setSubmitted(false); setPhotoPreview(null); }}>
            Add Another Teacher
          </Button>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => navigate(`${base}/teachers`)}>
            View All Teachers
          </Button>
        </div>
      </div>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      // ── Step 1: Personal ────────────────────────────────────────────────────
      case 1: return (
        <div className="space-y-7">
          <SectionTitle icon={User} title="Personal Information" subtitle="Basic personal details of the teacher" />

          {/* Photo */}
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              {photoPreview
                ? <img src={photoPreview} className="w-28 h-28 rounded-xl object-cover border-2 border-violet-300 dark:border-violet-500/30" />
                : <div className="w-28 h-28 rounded-xl bg-accent border-2 border-dashed border-border flex flex-col items-center justify-center text-foreground/30">
                    <Camera className="h-7 w-7" /><span className="text-[10px] mt-1">Photo</span>
                  </div>
              }
              <label className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center cursor-pointer shadow">
                <Upload className="h-3.5 w-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            </div>
            <div className="text-sm text-foreground/60 space-y-1">
              <p className="font-medium text-foreground/80">Staff Photograph</p>
              <p>Upload recent passport-size photo</p>
              <p className="text-xs">JPG/PNG, max 2MB, white background preferred</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Lbl required>First Name</Lbl><Inp placeholder="Anjali" value={form.firstName} onChange={e => set("firstName", e.target.value)} /></div>
            <div><Lbl>Middle Name</Lbl><Inp placeholder="Devi" value={form.middleName} onChange={e => set("middleName", e.target.value)} /></div>
            <div><Lbl required>Last Name</Lbl><Inp placeholder="Sharma" value={form.lastName} onChange={e => set("lastName", e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div><Lbl required>Date of Birth</Lbl><Inp type="date" value={form.dob} onChange={e => set("dob", e.target.value)} /></div>
            <div><Lbl required>Gender</Lbl>
              <Sel value={form.gender} onChange={e => set("gender", e.target.value)}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </Sel>
            </div>
            <div><Lbl>Blood Group</Lbl>
              <Sel value={form.bloodGroup} onChange={e => set("bloodGroup", e.target.value)}>
                <option value="">Select</option>{BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
              </Sel>
            </div>
            <div><Lbl>Marital Status</Lbl>
              <Sel value={form.maritalStatus} onChange={e => set("maritalStatus", e.target.value)}>
                <option value="">Select</option>{MARITAL_STATUS.map(m => <option key={m}>{m}</option>)}
              </Sel>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Lbl>Nationality</Lbl><Inp value={form.nationality} onChange={e => set("nationality", e.target.value)} /></div>
            <div><Lbl>Religion</Lbl>
              <Sel value={form.religion} onChange={e => set("religion", e.target.value)}>
                <option value="">Select</option>{RELIGIONS.map(r => <option key={r}>{r}</option>)}
              </Sel>
            </div>
            <div><Lbl>Category</Lbl>
              <Sel value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="">Select</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Sel>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Lbl required>Mobile Number</Lbl>
              <div className="flex">
                <span className="flex items-center px-3 bg-accent border border-r-0 border-border rounded-l-lg text-sm text-foreground/60">+91</span>
                <Inp placeholder="9876543210" value={form.phone} onChange={e => set("phone", e.target.value)} className="rounded-l-none" />
              </div>
            </div>
            <div>
              <Lbl>Alternate Phone</Lbl>
              <div className="flex">
                <span className="flex items-center px-3 bg-accent border border-r-0 border-border rounded-l-lg text-sm text-foreground/60">+91</span>
                <Inp placeholder="9876543210" value={form.alternatePhone} onChange={e => set("alternatePhone", e.target.value)} className="rounded-l-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Lbl required>Official School Email</Lbl><Inp type="email" placeholder="teacher@school.edu" value={form.email} onChange={e => set("email", e.target.value)} /></div>
            <div><Lbl>Personal Email</Lbl><Inp type="email" placeholder="personal@gmail.com" value={form.personalEmail} onChange={e => set("personalEmail", e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Lbl required>Aadhar Card No.</Lbl>
              <Inp placeholder="XXXX XXXX XXXX" maxLength={14} value={form.aadharNo} onChange={e => set("aadharNo", e.target.value)} />
              <p className="text-xs text-foreground/40 mt-1">12-digit Aadhar number</p>
            </div>
            <div>
              <Lbl required>PAN Card No.</Lbl>
              <Inp placeholder="ABCDE1234F" maxLength={10} value={form.panNo} onChange={e => set("panNo", e.target.value.toUpperCase())} />
              <p className="text-xs text-foreground/40 mt-1">Required for salary TDS</p>
            </div>
          </div>
        </div>
      );

      // ── Step 2: Professional ──────────────────────────────────────────────────
      case 2: return (
        <div className="space-y-6">
          <SectionTitle icon={Briefcase} title="Professional Details" subtitle="Designation, department, subjects and joining info" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div><Lbl>Employee ID</Lbl><Inp placeholder="Auto-generated" value={form.employeeId} onChange={e => set("employeeId", e.target.value)} /></div>
            <div><Lbl required>Designation</Lbl>
              <Sel value={form.designation} onChange={e => set("designation", e.target.value)}>
                <option value="">Select Designation</option>{DESIGNATIONS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </div>
            <div><Lbl required>Department</Lbl>
              <Sel value={form.department} onChange={e => set("department", e.target.value)}>
                <option value="">Select Department</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div><Lbl required>Joining Date</Lbl><Inp type="date" value={form.joiningDate} onChange={e => set("joiningDate", e.target.value)} /></div>
            <div><Lbl required>Employment Type</Lbl>
              <Sel value={form.employmentType} onChange={e => set("employmentType", e.target.value)}>
                <option value="">Select</option>{EMPLOYMENT_TYPES.map(e => <option key={e}>{e}</option>)}
              </Sel>
            </div>
            <div><Lbl>Academic Year</Lbl>
              <Sel value={form.academicYear} onChange={e => set("academicYear", e.target.value)}>
                <option>2025-26</option><option>2026-27</option>
              </Sel>
            </div>
            <div><Lbl>Medium</Lbl>
              <Sel value={form.medium} onChange={e => set("medium", e.target.value)}>
                <option value="">Select</option>{MEDIUMS.map(m => <option key={m}>{m}</option>)}
              </Sel>
            </div>
          </div>

          <div><Lbl>Reporting To (HOD / Principal)</Lbl><Inp placeholder="Name of reporting authority" value={form.reportingTo} onChange={e => set("reportingTo", e.target.value)} /></div>

          <div>
            <Lbl required>Subjects to Be Taught</Lbl>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {SUBJECTS.map(s => <ToggleChip key={s} label={s} selected={form.subjectsTaught.includes(s)} onToggle={() => toggleArr("subjectsTaught", s)} />)}
            </div>
          </div>

          <div>
            <Lbl>Classes to Handle</Lbl>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {CLASSES_LIST.map(c => <ToggleChip key={c} label={`Class ${c}`} selected={form.classesHandled.includes(c)} onToggle={() => toggleArr("classesHandled", c)} />)}
            </div>
          </div>

          <InfoBox type="info">
            <p className="font-medium">Class Teacher Assignment</p>
            <p className="text-xs mt-0.5 opacity-80">Class teacher assignment can be done after registration from the Class Management section.</p>
          </InfoBox>
        </div>
      );

      // ── Step 3: Address ───────────────────────────────────────────────────────
      case 3: return (
        <div className="space-y-6">
          <SectionTitle icon={Home} title="Address Details" subtitle="Present and permanent residential address" />
          <div><Lbl required>Present Address</Lbl><Txta placeholder="House No., Street, Area, Locality..." value={form.presentAddress} onChange={e => set("presentAddress", e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div><Lbl>City</Lbl><Inp placeholder="Lucknow" value={form.presentCity} onChange={e => set("presentCity", e.target.value)} /></div>
            <div><Lbl>State</Lbl><Inp placeholder="Uttar Pradesh" value={form.presentState} onChange={e => set("presentState", e.target.value)} /></div>
            <div><Lbl>PIN Code</Lbl><Inp placeholder="226001" maxLength={6} value={form.presentPincode} onChange={e => set("presentPincode", e.target.value)} /></div>
          </div>
          <ChkBox checked={form.sameAddress} onChange={syncPermanent} label="Permanent address same as present address" />
          {!form.sameAddress && (
            <div className="border-t border-border pt-5 space-y-5">
              <div><Lbl>Permanent Address</Lbl><Txta placeholder="House No., Street, Area..." value={form.permanentAddress} onChange={e => set("permanentAddress", e.target.value)} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                <div><Lbl>City</Lbl><Inp placeholder="City" value={form.permanentCity} onChange={e => set("permanentCity", e.target.value)} /></div>
                <div><Lbl>State</Lbl><Inp placeholder="State" value={form.permanentState} onChange={e => set("permanentState", e.target.value)} /></div>
                <div><Lbl>PIN Code</Lbl><Inp placeholder="000000" maxLength={6} value={form.permanentPincode} onChange={e => set("permanentPincode", e.target.value)} /></div>
              </div>
            </div>
          )}
        </div>
      );

      // ── Step 4: Qualifications ────────────────────────────────────────────────
      case 4: return (
        <div className="space-y-7">
          <SectionTitle icon={GraduationCap} title="Academic Qualifications" subtitle="All degrees, certifications and teaching eligibility tests" />

          {/* Academic Degrees */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Academic Degrees</p>
              <button onClick={addQual} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
                <Plus className="h-4 w-4" /> Add Degree
              </button>
            </div>
            <div className="space-y-4">
              {form.qualifications.map((q, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-accent/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Qualification {i + 1}</p>
                    {form.qualifications.length > 1 && (
                      <button onClick={() => removeQual(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div><Lbl required>Degree</Lbl><Inp placeholder="B.Sc / M.A / PhD" value={q.degree} onChange={e => updateQual(i,"degree",e.target.value)} /></div>
                    <div className="sm:col-span-2"><Lbl required>Institute / University</Lbl><Inp placeholder="Delhi University" value={q.institute} onChange={e => updateQual(i,"institute",e.target.value)} /></div>
                    <div><Lbl>Board / Affiliating</Lbl>
                      <Sel value={q.board} onChange={e => updateQual(i,"board",e.target.value)}>
                        <option value="">Select</option>{DEGREE_BOARDS.map(b => <option key={b}>{b}</option>)}
                      </Sel>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Lbl>Year</Lbl><Inp placeholder="2018" maxLength={4} value={q.year} onChange={e => updateQual(i,"year",e.target.value)} /></div>
                      <div><Lbl>%</Lbl><Inp placeholder="75.5" value={q.percentage} onChange={e => updateQual(i,"percentage",e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* B.Ed */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">B.Ed / D.El.Ed (Teacher Training)</p>
              <ChkBox checked={form.hasBEd} onChange={v => set("hasBEd", v)} label="Has B.Ed / D.El.Ed" />
            </div>
            {form.hasBEd && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><Lbl>Institute Name</Lbl><Inp placeholder="College of Education" value={form.bEdInstitute} onChange={e => set("bEdInstitute", e.target.value)} /></div>
                <div><Lbl>Passing Year</Lbl><Inp placeholder="2020" maxLength={4} value={form.bEdYear} onChange={e => set("bEdYear", e.target.value)} /></div>
                <div><Lbl>Percentage / Grade</Lbl><Inp placeholder="78" value={form.bEdPercent} onChange={e => set("bEdPercent", e.target.value)} /></div>
              </div>
            )}
          </div>

          {/* TET */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">TET (State Teacher Eligibility Test)</p>
              <ChkBox checked={form.hasTET} onChange={v => set("hasTET", v)} label="Has TET Qualification" />
            </div>
            {form.hasTET && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><Lbl>TET Level</Lbl>
                  <Sel value={form.tetLevel} onChange={e => set("tetLevel", e.target.value)}>
                    <option value="">Select</option>{TET_LEVELS.map(t => <option key={t}>{t}</option>)}
                  </Sel>
                </div>
                <div><Lbl>Score / Marks</Lbl><Inp placeholder="120 / 150" value={form.tetScore} onChange={e => set("tetScore", e.target.value)} /></div>
                <div><Lbl>Year</Lbl><Inp placeholder="2021" maxLength={4} value={form.tetYear} onChange={e => set("tetYear", e.target.value)} /></div>
              </div>
            )}
          </div>

          {/* CTET */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">CTET (Central Teacher Eligibility Test)</p>
              <ChkBox checked={form.hasCTET} onChange={v => set("hasCTET", v)} label="Has CTET Qualification" />
            </div>
            {form.hasCTET && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><Lbl>CTET Paper</Lbl>
                  <Sel value={form.ctetPaper} onChange={e => set("ctetPaper", e.target.value)}>
                    <option value="">Select</option>{CTET_PAPERS.map(p => <option key={p}>{p}</option>)}
                  </Sel>
                </div>
                <div><Lbl>Score / Marks</Lbl><Inp placeholder="115 / 150" value={form.ctetScore} onChange={e => set("ctetScore", e.target.value)} /></div>
                <div><Lbl>Year</Lbl><Inp placeholder="2022" maxLength={4} value={form.ctetYear} onChange={e => set("ctetYear", e.target.value)} /></div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-5">
            <Lbl>Other Certifications / Achievements</Lbl>
            <Txta placeholder="NET, SET, NTT, Montessori certification, online courses, national awards..." value={form.otherCerts} onChange={e => set("otherCerts", e.target.value)} />
          </div>
        </div>
      );

      // ── Step 5: Experience ────────────────────────────────────────────────────
      case 5: return (
        <div className="space-y-6">
          <SectionTitle icon={Award} title="Work Experience" subtitle="Previous teaching and professional experience" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Lbl>Total Teaching Experience</Lbl><Inp placeholder="e.g. 5 years 3 months" value={form.totalExperience} onChange={e => set("totalExperience", e.target.value)} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Previous Employment History</p>
              <button onClick={addExp} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
                <Plus className="h-4 w-4" /> Add Experience
              </button>
            </div>

            {form.experiences.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-border rounded-xl text-foreground/40 text-sm">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No experience added yet.</p>
                <p className="text-xs mt-1">Click "Add Experience" to add previous school details.</p>
              </div>
            )}

            <div className="space-y-4">
              {form.experiences.map((exp, i) => (
                <div key={i} className="p-5 rounded-xl border border-border bg-accent/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Experience {i + 1}</p>
                    <button onClick={() => removeExp(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Lbl required>School / Institution Name</Lbl><Inp placeholder="DPS Lucknow" value={exp.schoolName} onChange={e => updateExp(i,"schoolName",e.target.value)} /></div>
                    <div><Lbl required>Designation Held</Lbl><Inp placeholder="TGT Mathematics" value={exp.designation} onChange={e => updateExp(i,"designation",e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><Lbl>From Date</Lbl><Inp type="date" value={exp.from} onChange={e => updateExp(i,"from",e.target.value)} /></div>
                    <div><Lbl>To Date</Lbl><Inp type="date" value={exp.to} onChange={e => updateExp(i,"to",e.target.value)} /></div>
                    <div><Lbl>Reason for Leaving</Lbl><Inp placeholder="Better opportunity" value={exp.reasonLeaving} onChange={e => updateExp(i,"reasonLeaving",e.target.value)} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <InfoBox type="info">
            <p className="text-xs">Experience certificates will be verified during the document check. Teachers with no prior experience can leave this section empty.</p>
          </InfoBox>
        </div>
      );

      // ── Step 6: Family ────────────────────────────────────────────────────────
      case 6: return (
        <div className="space-y-7">
          {/* Father */}
          <div>
            <SectionTitle icon={Users} title="Father's Details" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div><Lbl>Father's Full Name</Lbl><Inp placeholder="Ramesh Sharma" value={form.fatherName} onChange={e => set("fatherName", e.target.value)} /></div>
              <div><Lbl>Occupation</Lbl><Inp placeholder="Retired / Business..." value={form.fatherOccupation} onChange={e => set("fatherOccupation", e.target.value)} /></div>
              <div><Lbl>Phone</Lbl><Inp placeholder="9876543210" value={form.fatherPhone} onChange={e => set("fatherPhone", e.target.value)} /></div>
            </div>
          </div>

          {/* Mother */}
          <div className="border-t border-border pt-6">
            <SectionTitle icon={Heart} title="Mother's Details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><Lbl>Mother's Full Name</Lbl><Inp placeholder="Sunita Sharma" value={form.motherName} onChange={e => set("motherName", e.target.value)} /></div>
              <div><Lbl>Occupation</Lbl><Inp placeholder="Housewife / Teacher..." value={form.motherOccupation} onChange={e => set("motherOccupation", e.target.value)} /></div>
            </div>
          </div>

          {/* Spouse */}
          {(form.maritalStatus === "Married") && (
            <div className="border-t border-border pt-6">
              <SectionTitle icon={Heart} title="Spouse Details" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><Lbl>Spouse Name</Lbl><Inp value={form.spouseName} onChange={e => set("spouseName", e.target.value)} /></div>
                <div><Lbl>Occupation</Lbl><Inp value={form.spouseOccupation} onChange={e => set("spouseOccupation", e.target.value)} /></div>
                <div><Lbl>Phone</Lbl><Inp value={form.spousePhone} onChange={e => set("spousePhone", e.target.value)} /></div>
              </div>
              <div className="mt-4">
                <Lbl>Number of Children</Lbl>
                <Sel value={form.children} onChange={e => set("children", e.target.value)} style={{ width: "auto", minWidth: "150px" }}>
                  <option value="">Select</option>{["0","1","2","3","4+"].map(n => <option key={n}>{n}</option>)}
                </Sel>
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          <div className="border-t border-border pt-6">
            <SectionTitle icon={Phone} title="Emergency Contact" subtitle="Person to contact in case of emergency" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div><Lbl required>Contact Name</Lbl><Inp placeholder="Full name" value={form.emergencyContact} onChange={e => set("emergencyContact", e.target.value)} /></div>
              <div><Lbl required>Relation</Lbl><Inp placeholder="Spouse / Father / Friend..." value={form.emergencyRelation} onChange={e => set("emergencyRelation", e.target.value)} /></div>
              <div><Lbl required>Phone</Lbl><Inp placeholder="9876543210" value={form.emergencyPhone} onChange={e => set("emergencyPhone", e.target.value)} /></div>
            </div>
          </div>
        </div>
      );

      // ── Step 7: Bank & Salary ─────────────────────────────────────────────────
      case 7: return (
        <div className="space-y-7">
          {/* Bank */}
          <div>
            <SectionTitle icon={Banknote} title="Bank Account Details" subtitle="For salary credit and reimbursements" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><Lbl required>Bank Name</Lbl><Inp placeholder="State Bank of India" value={form.bankName} onChange={e => set("bankName", e.target.value)} /></div>
              <div><Lbl required>Account Number</Lbl><Inp placeholder="XXXXXXXXXXXXXXXX" value={form.accountNo} onChange={e => set("accountNo", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5">
              <div><Lbl required>IFSC Code</Lbl><Inp placeholder="SBIN0001234" maxLength={11} value={form.ifscCode} onChange={e => set("ifscCode", e.target.value.toUpperCase())} /></div>
              <div><Lbl>Branch Name</Lbl><Inp placeholder="Hazratganj Branch" value={form.branchName} onChange={e => set("branchName", e.target.value)} /></div>
              <div><Lbl>Account Type</Lbl>
                <Sel value={form.accountType} onChange={e => set("accountType", e.target.value)}>
                  {ACCOUNT_TYPES.map(a => <option key={a}>{a}</option>)}
                </Sel>
              </div>
            </div>
            <InfoBox type="warning">
              <p className="font-medium">Important</p>
              <p className="text-xs mt-0.5 opacity-80">Bank details are used exclusively for salary disbursement. Please verify account number carefully as incorrect details may cause payment failures.</p>
            </InfoBox>
          </div>

          {/* Salary */}
          <div className="border-t border-border pt-6">
            <SectionTitle icon={Building2} title="Salary Structure" subtitle="Grade pay, basic and allowances (as per school policy)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><Lbl>Salary Grade</Lbl>
                <Sel value={form.salaryGrade} onChange={e => set("salaryGrade", e.target.value)}>
                  <option value="">Select Grade</option>{SALARY_GRADES.map(g => <option key={g}>{g}</option>)}
                </Sel>
              </div>
              <div><Lbl>Basic Salary (₹)</Lbl><Inp type="number" placeholder="25000" value={form.basicSalary} onChange={e => set("basicSalary", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
              <div><Lbl>HRA (₹)</Lbl><Inp type="number" placeholder="5000" value={form.hra} onChange={e => set("hra", e.target.value)} /></div>
              <div><Lbl>DA (₹)</Lbl><Inp type="number" placeholder="3000" value={form.da} onChange={e => set("da", e.target.value)} /></div>
              <div><Lbl>TA (₹)</Lbl><Inp type="number" placeholder="1500" value={form.ta} onChange={e => set("ta", e.target.value)} /></div>
              <div><Lbl>Other Allowances (₹)</Lbl><Inp type="number" placeholder="2000" value={form.otherAllowances} onChange={e => set("otherAllowances", e.target.value)} /></div>
            </div>
            {(form.basicSalary) && (
              <div className="mt-4 p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-sm">
                <p className="text-violet-700 dark:text-violet-300 font-medium">Gross Monthly Salary: ₹{
                  [form.basicSalary, form.hra, form.da, form.ta, form.otherAllowances]
                    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                    .toLocaleString("en-IN")
                }</p>
              </div>
            )}
          </div>

          {/* PF / ESI */}
          <div className="border-t border-border pt-6">
            <SectionTitle icon={Shield} title="PF / ESI / GPF Numbers" subtitle="Provident Fund and statutory deduction details" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div><Lbl>PF Account No.</Lbl><Inp placeholder="PF/UP/123/456789" value={form.pfNo} onChange={e => set("pfNo", e.target.value)} /></div>
              <div><Lbl>ESI No.</Lbl><Inp placeholder="ESI-XXXXXXXXX" value={form.esiNo} onChange={e => set("esiNo", e.target.value)} /></div>
              <div><Lbl>GPF No. (Govt. employees)</Lbl><Inp placeholder="GPF/XXXX/XXXXX" value={form.gpfNo} onChange={e => set("gpfNo", e.target.value)} /></div>
            </div>
          </div>
        </div>
      );

      // ── Step 8: Health ────────────────────────────────────────────────────────
      case 8: return (
        <div className="space-y-6">
          <SectionTitle icon={Stethoscope} title="Health Information" subtitle="Medical details for staff welfare and emergency response" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div><Lbl>Height (cm)</Lbl><Inp type="number" placeholder="165" value={form.height} onChange={e => set("height", e.target.value)} /></div>
            <div><Lbl>Weight (kg)</Lbl><Inp type="number" placeholder="60" value={form.weight} onChange={e => set("weight", e.target.value)} /></div>
            <div><Lbl>Family Doctor Name</Lbl><Inp placeholder="Dr. Verma" value={form.doctorName} onChange={e => set("doctorName", e.target.value)} /></div>
            <div><Lbl>Doctor's Phone</Lbl><Inp placeholder="9876543210" value={form.doctorPhone} onChange={e => set("doctorPhone", e.target.value)} /></div>
          </div>
          <div><Lbl>Known Medical Conditions</Lbl><Txta placeholder="Diabetes, Hypertension, Heart condition... (leave blank if none)" value={form.medicalCondition} onChange={e => set("medicalCondition", e.target.value)} /></div>
          <div><Lbl>Known Allergies</Lbl><Txta placeholder="Food allergies, medication allergies... (leave blank if none)" value={form.allergies} onChange={e => set("allergies", e.target.value)} /></div>

          <div className="border-t border-border pt-5">
            <ChkBox checked={form.physicallyHandicapped} onChange={v => set("physicallyHandicapped", v)} label="Person with Disability (PwD)" />
            {form.physicallyHandicapped && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
                <div><Lbl>Type of Disability</Lbl><Inp placeholder="Visual / Hearing / Locomotor..." value={form.handicapType} onChange={e => set("handicapType", e.target.value)} /></div>
                <div><Lbl>Disability Percentage (%)</Lbl><Inp type="number" placeholder="40" min="0" max="100" value={form.handicapPercent} onChange={e => set("handicapPercent", e.target.value)} /></div>
              </div>
            )}
          </div>
          <div><Lbl>Special Requirements / Accessibility Needs</Lbl><Txta placeholder="Wheelchair access, specific seating... (leave blank if none)" value={form.specialNeeds} onChange={e => set("specialNeeds", e.target.value)} /></div>
        </div>
      );

      // ── Step 9: Documents ─────────────────────────────────────────────────────
      case 9: return (
        <div className="space-y-6">
          <SectionTitle icon={FileText} title="Documents Submitted" subtitle="Tick all documents physically received at the time of joining" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["docAadhar",           "Aadhar Card (Self-attested copy)"],
              ["docPan",              "PAN Card (Self-attested copy)"],
              ["docDegree",           "All Degree / Marksheet Certificates (Originals + Copies)"],
              ["docBEd",              "B.Ed / D.El.Ed Certificate"],
              ["docTET",              "TET / CTET Certificate"],
              ["docExperience",       "Experience Certificate(s) from Previous Schools"],
              ["docCaste",            "Caste / Category Certificate (if applicable)"],
              ["docResidence",        "Residence / Address Proof"],
              ["docPassport",         "Passport Size Photographs (4 copies)"],
              ["docMedical",          "Medical / Fitness Certificate"],
              ["docPoliceVerification","Police Verification Certificate"],
            ] as [keyof FormData, string][]).map(([field, label]) => (
              <ChkBox key={field} checked={form[field] as boolean} onChange={(v) => set(field, v)} label={label} />
            ))}
          </div>

          <InfoBox type="warning">
            <p className="font-medium">Document Verification</p>
            <p className="text-xs mt-0.5 opacity-80">Original documents must be presented at the time of joining for verification. Copies will be retained in the staff file. Incomplete documentation may delay salary processing.</p>
          </InfoBox>
        </div>
      );

      // ── Step 10: Declaration ──────────────────────────────────────────────────
      case 10: return (
        <div className="space-y-6">
          <SectionTitle icon={Shield} title="Declaration & Final Submission" subtitle="Review and confirm all information before submitting" />

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Full Name",        value: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || "—" },
              { label: "Designation",      value: form.designation || "—" },
              { label: "Department",       value: form.department || "—" },
              { label: "Joining Date",     value: form.joiningDate || "—" },
              { label: "Employment Type",  value: form.employmentType || "—" },
              { label: "Mobile",           value: form.phone || "—" },
              { label: "Subjects",         value: form.subjectsTaught.slice(0,2).join(", ") + (form.subjectsTaught.length > 2 ? ` +${form.subjectsTaught.length - 2} more` : "") || "—" },
              { label: "Qualifications",   value: form.qualifications.filter(q => q.degree).map(q => q.degree).join(", ") || "—" },
              { label: "Bank",             value: form.bankName || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-lg bg-accent/30 border border-border">
                <p className="text-xs text-foreground/50 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-foreground truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Joining Remarks */}
          <div>
            <Lbl>Joining Remarks (Principal's Note)</Lbl>
            <Txta placeholder="Any special notes, conditions, or remarks at the time of joining..." value={form.joiningRemarks} onChange={e => set("joiningRemarks", e.target.value)} />
          </div>

          {/* Declaration */}
          <div className="p-5 rounded-xl bg-accent/40 border border-border text-sm text-foreground/70 space-y-2 leading-relaxed">
            <p className="font-semibold text-foreground">Declaration by the Appointing Authority (Principal)</p>
            <p>I hereby certify that the above information has been verified and the candidate has fulfilled all the requirements for appointment. The appointment is made in accordance with the school's recruitment policy and applicable education regulations.</p>
            <p>I also confirm that the personal and professional data collected herein will be used solely for school administration, payroll, and statutory compliance purposes, and will be stored securely as per applicable data protection norms.</p>
          </div>
          <ChkBox
            checked={form.declarationAccepted}
            onChange={(v) => set("declarationAccepted", v)}
            label="I confirm the above declaration and authorize the creation of this teacher's profile in the school system."
          />
        </div>
      );

      default: return null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6 p-6">

      {/* Page Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Add New Teacher</h1>
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
              <div className="h-full bg-violet-600 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs text-foreground/50 shrink-0">{progressPct}% complete</span>
          </div>
        </CardContent>
      </Card>

      {/* Form Card */}
      <Card>
        <CardContent className="p-8 sm:p-10">
          {renderStep()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between pb-10">
        <Button variant="outline" onClick={() => setStep(p => Math.max(1, p - 1))} disabled={step === 1} className="gap-2 px-6 py-5 text-base">
          <ChevronLeft className="h-5 w-5" /> Previous
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-foreground/60 px-6 py-5 text-base" onClick={() => toast.success("Draft saved!")}>
            <Save className="h-5 w-5" /> Save Draft
          </Button>
          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={!form.declarationAccepted} className="gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-5 text-base">
              <CheckCircle2 className="h-5 w-5" /> Submit & Register
            </Button>
          ) : (
            <Button onClick={() => setStep(p => Math.min(steps.length, p + 1))} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-5 text-base">
              Next <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}