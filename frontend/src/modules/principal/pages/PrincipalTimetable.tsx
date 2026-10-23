
import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Plus, Trash2, Wand2, Download, RotateCcw,
  Clock, BookOpen, Coffee, ChevronRight, CheckCircle2,
  AlertCircle, Settings2, Pencil, AlertTriangle,
  Users, Building2, ArrowLeftRight, Lock, Unlock,
  ChevronLeft, Search, X, Info, Zap, Shield
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════

type SubjectType = "academic" | "extracurricular" | "free";

type Teacher = {
  id: string;
  name: string;
  shortName: string;
  subjectIds: string[];
  unavailableSlots: string[]; // "dayIdx-slotIdx"
};

type Subject = {
  id: string;
  name: string;
  shortName: string;
  type: SubjectType;
  periodsPerWeek: number;
  color: string;
  requiresLab: boolean;
};

type Room = {
  id: string;
  name: string;
  type: "classroom" | "lab" | "hall";
  capacity: number;
};

type PeriodSlot = {
  startTime: string;
  endTime: string;
  label?: string;
  isBreak?: boolean;
};

type TimetableCell = {
  subjectId: string | null;
  subjectName: string;
  shortName: string;
  color: string;
  type: string;
  teacherId: string | null;
  teacherName: string;
  roomId: string | null;
  roomName: string;
  locked: boolean;
  conflict: boolean;
  conflictReason?: string;
};

type GeneratedTimetable = Record<string, TimetableCell[]>;

type Conflict = {
  type: "teacher_clash" | "room_clash" | "unplaced";
  message: string;
  day?: string;
  slotIdx?: number;
};

type WizardStep = "basics" | "teachers" | "subjects" | "rooms" | "slots" | "preview";

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAYS_OPTIONS = [
  { value: 5, label: "Mon – Fri",  sub: "5 days" },
  { value: 6, label: "Mon – Sat",  sub: "6 days" },
];

const SUBJECT_COLORS = [
  "#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
  "#06b6d4","#a855f7","#e11d48","#0891b2","#65a30d",
];

const PRESET_SUBJECTS: Omit<Subject,"id"|"color">[] = [
  { name:"Mathematics",     shortName:"MATH", type:"academic",        periodsPerWeek:6, requiresLab:false },
  { name:"Physics",         shortName:"PHY",  type:"academic",        periodsPerWeek:5, requiresLab:true  },
  { name:"Chemistry",       shortName:"CHEM", type:"academic",        periodsPerWeek:5, requiresLab:true  },
  { name:"English",         shortName:"ENG",  type:"academic",        periodsPerWeek:5, requiresLab:false },
  { name:"Biology",         shortName:"BIO",  type:"academic",        periodsPerWeek:4, requiresLab:true  },
  { name:"History",         shortName:"HIST", type:"academic",        periodsPerWeek:3, requiresLab:false },
  { name:"Geography",       shortName:"GEO",  type:"academic",        periodsPerWeek:3, requiresLab:false },
  { name:"Computer Science",shortName:"CS",   type:"academic",        periodsPerWeek:3, requiresLab:true  },
  { name:"Hindi",           shortName:"HIN",  type:"academic",        periodsPerWeek:4, requiresLab:false },
  { name:"Economics",       shortName:"ECO",  type:"academic",        periodsPerWeek:3, requiresLab:false },
  { name:"Physical Education",shortName:"PE", type:"extracurricular", periodsPerWeek:2, requiresLab:false },
  { name:"Art & Craft",     shortName:"ART",  type:"extracurricular", periodsPerWeek:2, requiresLab:false },
  { name:"Music",           shortName:"MUS",  type:"extracurricular", periodsPerWeek:1, requiresLab:false },
  { name:"Assembly",        shortName:"ASM",  type:"extracurricular", periodsPerWeek:1, requiresLab:false },
];

const PRESET_TEACHERS: Omit<Teacher,"id"|"unavailableSlots">[] = [
  { name:"Mr. Arjun Sharma",   shortName:"ARS", subjectIds:[] },
  { name:"Ms. Priya Verma",    shortName:"PRV", subjectIds:[] },
  { name:"Dr. Rahul Mehta",    shortName:"RHM", subjectIds:[] },
  { name:"Mrs. Sunita Kapoor", shortName:"SNK", subjectIds:[] },
  { name:"Mr. Vivek Iyer",     shortName:"VVI", subjectIds:[] },
];

const ROOM_PRESETS: Omit<Room,"id">[] = [
  { name:"Room 101", type:"classroom", capacity:40 },
  { name:"Room 102", type:"classroom", capacity:40 },
  { name:"Science Lab", type:"lab",   capacity:30 },
  { name:"Computer Lab", type:"lab",  capacity:35 },
  { name:"Assembly Hall", type:"hall",capacity:200},
];

const TYPE_META: Record<SubjectType,{ label:string; icon:string; tw:string }> = {
  academic:        { label:"Academic",         icon:"📚", tw:"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  extracurricular: { label:"Extra Curricular", icon:"🏃", tw:"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  free:            { label:"Free Period",      icon:"🕊️", tw:"bg-muted text-muted-foreground" },
};

// ═══════════════════════════════════════════════════════════
//  SMART GENERATOR ENGINE
// ═══════════════════════════════════════════════════════════

function uid() { return Math.random().toString(36).slice(2,9); }

function detectConflicts(
  grid: (TimetableCell|null)[][],
  days: string[],
  slots: PeriodSlot[]
): Conflict[] {
  const conflicts: Conflict[] = [];
  const teachableSlots = slots.map((s,i) => ({ s, i })).filter(x => !x.s.isBreak).map(x => x.i);

  for (const si of teachableSlots) {
    const teacherAtSlot: Record<string, { di: number }> = {};
    const roomAtSlot:    Record<string, { di: number }> = {};

    for (let di = 0; di < days.length; di++) {
      const cell = grid[di]?.[si];
      if (!cell || cell.type === "break" || !cell.subjectId) continue;

      if (cell.teacherId) {
        if (teacherAtSlot[cell.teacherId] !== undefined) {
          conflicts.push({
            type: "teacher_clash",
            message: `${cell.teacherName} is scheduled in 2 classes at ${slots[si].startTime}`,
            day: days[di], slotIdx: si,
          });
          cell.conflict = true;
          cell.conflictReason = "Teacher clash";
          grid[teacherAtSlot[cell.teacherId].di][si]!.conflict = true;
          grid[teacherAtSlot[cell.teacherId].di][si]!.conflictReason = "Teacher clash";
        } else {
          teacherAtSlot[cell.teacherId] = { di };
        }
      }

      if (cell.roomId) {
        if (roomAtSlot[cell.roomId] !== undefined) {
          conflicts.push({
            type: "room_clash",
            message: `${cell.roomName} is double-booked at ${slots[si].startTime}`,
            day: days[di], slotIdx: si,
          });
          cell.conflict = true;
          cell.conflictReason = "Room clash";
        } else {
          roomAtSlot[cell.roomId] = { di };
        }
      }
    }
  }
  return conflicts;
}

function generateTimetable(
  subjects:  Subject[],
  teachers:  Teacher[],
  rooms:     Room[],
  slots:     PeriodSlot[],
  days:      string[],
  prevGrid?: GeneratedTimetable | null
): { timetable: GeneratedTimetable; conflicts: Conflict[] } {

  const teachableIndices = slots.map((s,i)=>({s,i})).filter(x=>!x.s.isBreak).map(x=>x.i);
  const availPerDay      = teachableIndices.length;
  const availWeek        = availPerDay * days.length;

  // classrooms & labs
  const classrooms = rooms.filter(r => r.type === "classroom");
  const labs       = rooms.filter(r => r.type === "lab");

  // Build pool — each subject repeated periodsPerWeek times
  const pool: Subject[] = [];
  subjects.filter(s=>s.type!=="free").forEach(s => {
    const cnt = Math.min(s.periodsPerWeek, availWeek);
    for (let i=0; i<cnt; i++) pool.push(s);
  });
  // Fisher-Yates shuffle
  for (let i=pool.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }

  // Build teacher assignment map: subjectId → teacher
  const subjectTeacher: Record<string, Teacher|undefined> = {};
  subjects.forEach(sub => {
    const t = teachers.find(t => t.subjectIds.includes(sub.id));
    if (t) subjectTeacher[sub.id] = t;
  });

  // Track teacher usage per slot: teacherId → dayIdx set
  const teacherUsed: Record<string, Set<number>> = {};
  teachers.forEach(t => { teacherUsed[t.id] = new Set(); });

  // Init grid
  type GridCell = TimetableCell | null;
  const grid: GridCell[][] = days.map(() =>
    slots.map(s => s.isBreak ? {
      subjectId: "break", subjectName: s.label||"Break", shortName:"BRK",
      color:"#94a3b8", type:"break",
      teacherId:null, teacherName:"", roomId:null, roomName:"",
      locked:true, conflict:false,
    } : null)
  );

  // Preserve locked cells from previous grid
  if (prevGrid) {
    days.forEach((day, di) => {
      (prevGrid[day]||[]).forEach((cell, si) => {
        if (cell?.locked && !slots[si]?.isBreak) {
          grid[di][si] = { ...cell, conflict: false };
          // Remove this subject from pool if locked
          const idx = pool.findIndex(p => p.id === cell.subjectId);
          if (idx !== -1) pool.splice(idx, 1);
          if (cell.teacherId) teacherUsed[cell.teacherId]?.add(di);
        }
      });
    });
  }

  // --- Placement pass ---
  // Heavy subjects (≥5 periods) prefer morning slots (first half of teachable slots)
  const morningSlots = teachableIndices.slice(0, Math.ceil(teachableIndices.length / 2));
  const afternoonSlots = teachableIndices.slice(Math.ceil(teachableIndices.length / 2));

  const tryPlace = (dayIdx: number, slotIdx: number, subject: Subject): boolean => {
    if (grid[dayIdx][slotIdx] !== null) return false;

    const teacher = subjectTeacher[subject.id];
    const unavailKey = `${dayIdx}-${slotIdx}`;

    // Teacher availability check
    if (teacher) {
      if (teacherUsed[teacher.id]?.has(dayIdx + slotIdx * 100)) return false;
      if (teacher.unavailableSlots.includes(unavailKey)) return false;
    }

    // Avoid same subject back-to-back in same day
    const prevSlotInDay = teachableIndices[teachableIndices.indexOf(slotIdx) - 1];
    if (prevSlotInDay !== undefined && grid[dayIdx][prevSlotInDay]?.subjectId === subject.id) return false;

    // Avoid same subject at same time on consecutive days
    if (dayIdx > 0 && grid[dayIdx-1][slotIdx]?.subjectId === subject.id) return false;

    // Assign room
    let room: Room | undefined;
    if (subject.requiresLab) {
      // check lab not already in use this slot
      room = labs.find(lab => !days.some((_, di2) =>
        di2 !== dayIdx && grid[di2][slotIdx]?.roomId === lab.id
      )) || labs[0];
    } else {
      room = classrooms[dayIdx % Math.max(classrooms.length, 1)];
    }

    grid[dayIdx][slotIdx] = {
      subjectId:   subject.id,
      subjectName: subject.name,
      shortName:   subject.shortName,
      color:       subject.color,
      type:        subject.type,
      teacherId:   teacher?.id || null,
      teacherName: teacher?.name || "",
      roomId:      room?.id || null,
      roomName:    room?.name || "",
      locked:      false,
      conflict:    false,
    };

    if (teacher) teacherUsed[teacher.id]?.add(dayIdx + slotIdx * 100);
    return true;
  };

  let remaining = [...pool];

  // Pass 1: prefer morning for heavy subjects
  const heavy = remaining.filter(s => s.periodsPerWeek >= 5);
  const light  = remaining.filter(s => s.periodsPerWeek < 5);

  for (const subj of heavy) {
    let placed = false;
    for (const si of morningSlots) {
      for (let di=0; di<days.length; di++) {
        if (tryPlace(di, si, subj)) { placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) {
      for (const si of afternoonSlots) {
        for (let di=0; di<days.length; di++) {
          if (tryPlace(di, si, subj)) { placed = true; break; }
        }
        if (placed) break;
      }
    }
    if (placed) remaining = remaining.filter(s => s !== subj || (remaining.splice(remaining.indexOf(subj),1) && false));
  }
  remaining = light;

  // Pass 2: place light subjects
  for (const si of teachableIndices) {
    for (let di=0; di<days.length; di++) {
      if (grid[di][si] !== null) continue;
      let placed = false;
      for (let attempt=0; attempt<remaining.length; attempt++) {
        const subj = remaining[attempt];
        if (tryPlace(di, si, subj)) {
          remaining.splice(attempt, 1);
          placed = true;
          break;
        }
      }
      if (!placed && grid[di][si] === null) {
        // Free period
        grid[di][si] = {
          subjectId:null, subjectName:"Free", shortName:"FREE",
          color:"#e2e8f0", type:"free",
          teacherId:null, teacherName:"", roomId:null, roomName:"",
          locked:false, conflict:false,
        };
      }
    }
  }

  // Convert grid → result
  const result: GeneratedTimetable = {};
  days.forEach((day, di) => {
    result[day] = slots.map((_, si) => grid[di][si] || {
      subjectId:null, subjectName:"Free", shortName:"FREE",
      color:"#e2e8f0", type:"free",
      teacherId:null, teacherName:"", roomId:null, roomName:"",
      locked:false, conflict:false,
    });
  });

  // Conflict detection pass
  const finalGrid = days.map((day, di) =>
    slots.map((_, si) => result[day][si])
  );
  const conflicts = detectConflicts(finalGrid, days, slots);

  // Write conflict flags back
  days.forEach((day, di) => {
    result[day] = finalGrid[di];
  });

  return { timetable: result, conflicts };
}

// ═══════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════

export function PrincipalTimetable() {
  // ── Wizard state ──
  const [step, setStep] = useState<WizardStep>("basics");

  // ── Step 1: Basics ──
  const [schoolName,   setSchoolName]   = useState("Delhi Public School");
  const [className,    setClassName]    = useState("Class 10-A");
  const [totalDays,    setTotalDays]    = useState(5);
  const [academicYear, setAcademicYear] = useState("2025–2026");
  const [startDate,    setStartDate]    = useState("");

  // ── Step 2: Teachers ──
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [newTName,  setNewTName]  = useState("");
  const [newTShort, setNewTShort] = useState("");

  // ── Step 3: Subjects ──
  const [subjects,     setSubjects]     = useState<Subject[]>([]);
  const [colorCursor,  setColorCursor]  = useState(0);
  const [newSName,     setNewSName]     = useState("");
  const [newSShort,    setNewSShort]    = useState("");
  const [newSType,     setNewSType]     = useState<SubjectType>("academic");
  const [newSPeriods,  setNewSPeriods]  = useState(3);
  const [newSLab,      setNewSLab]      = useState(false);
  const [newSTeacher,  setNewSTeacher]  = useState("");

  // ── Step 4: Rooms ──
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRName, setNewRName] = useState("");
  const [newRType, setNewRType] = useState<Room["type"]>("classroom");
  const [newRCap,  setNewRCap]  = useState(40);

  // ── Step 5: Slots ──
  const [slots, setSlots] = useState<PeriodSlot[]>([
    { startTime:"08:00", endTime:"08:45" },
    { startTime:"08:45", endTime:"09:30" },
    { startTime:"09:30", endTime:"09:45", label:"Short Break", isBreak:true },
    { startTime:"09:45", endTime:"10:30" },
    { startTime:"10:30", endTime:"11:15" },
    { startTime:"11:15", endTime:"12:00" },
    { startTime:"12:00", endTime:"12:45", label:"Lunch Break", isBreak:true },
    { startTime:"12:45", endTime:"13:30" },
    { startTime:"13:30", endTime:"14:15" },
  ]);

  // ── Step 6: Preview ──
  const [timetable,  setTimetable]  = useState<GeneratedTimetable|null>(null);
  const [conflicts,  setConflicts]  = useState<Conflict[]>([]);
  const [editCell,   setEditCell]   = useState<{day:string;si:number}|null>(null);
  const [editData,   setEditData]   = useState({ subjectId:"", teacherId:"", roomId:"" });
  const [activeDay,  setActiveDay]  = useState(0);
  const [viewMode,   setViewMode]   = useState<"grid"|"teacher">("grid");
  const [teacherFilter, setTeacherFilter] = useState("all");

  const days = ALL_DAYS.slice(0, totalDays);

  // ── Derived ──
  const teachableSlots = slots.filter(s=>!s.isBreak).length;
  const availableWeek  = teachableSlots * days.length;
  const totalNeeded    = subjects.reduce((a,s)=>a+s.periodsPerWeek,0);
  const isOverloaded   = totalNeeded > availableWeek;

  // ── Teachers ──
  const addTeacher = () => {
    if (!newTName.trim()) { toast.error("Enter teacher name"); return; }
    setTeachers(p => [...p, { id:uid(), name:newTName.trim(), shortName:newTShort.trim()||newTName.slice(0,3).toUpperCase(), subjectIds:[], unavailableSlots:[] }]);
    setNewTName(""); setNewTShort("");
    toast.success("Teacher added");
  };
  const addPresetTeacher = (pt: typeof PRESET_TEACHERS[0]) => {
    if (teachers.find(t=>t.name===pt.name)) return;
    setTeachers(p => [...p, { id:uid(), ...pt, unavailableSlots:[] }]);
  };
  const removeTeacher = (id:string) => setTeachers(p=>p.filter(t=>t.id!==id));
  const assignTeacherSubject = (teacherId:string, subjectId:string, assign:boolean) => {
    setTeachers(p=>p.map(t=>{
      if (t.id!==teacherId) return t;
      return assign
        ? { ...t, subjectIds:[...new Set([...t.subjectIds, subjectId])] }
        : { ...t, subjectIds:t.subjectIds.filter(s=>s!==subjectId) };
    }));
    // Also update subject's assigned teacher in subjects list if needed
    if (assign) {
      setSubjects(prev => prev.map(s =>
        s.id === subjectId ? s : s
      ));
    }
  };

  // ── Subjects ──
  const addSubject = () => {
    if (!newSName.trim()) { toast.error("Enter subject name"); return; }
    const color = SUBJECT_COLORS[colorCursor % SUBJECT_COLORS.length];
    const newSub: Subject = {
      id:uid(), name:newSName.trim(),
      shortName: newSShort.trim()||newSName.slice(0,4).toUpperCase(),
      type:newSType, periodsPerWeek:newSPeriods,
      color, requiresLab:newSLab,
    };
    setSubjects(p=>[...p, newSub]);
    if (newSTeacher) {
      const t = teachers.find(t=>t.id===newSTeacher);
      if (t) setTeachers(p=>p.map(x=>x.id===newSTeacher ? {...x, subjectIds:[...x.subjectIds, newSub.id]} : x));
    }
    setColorCursor(c=>c+1);
    setNewSName(""); setNewSShort(""); setNewSPeriods(3); setNewSLab(false); setNewSTeacher("");
    toast.success("Subject added");
  };
  const addPresetSubject = (p: typeof PRESET_SUBJECTS[0]) => {
    if (subjects.find(s=>s.name===p.name)) { toast.error("Already added"); return; }
    const color = SUBJECT_COLORS[colorCursor % SUBJECT_COLORS.length];
    setSubjects(prev=>[...prev, { id:uid(), ...p, color }]);
    setColorCursor(c=>c+1);
  };
  const removeSubject = (id:string) => setSubjects(p=>p.filter(s=>s.id!==id));

  // ── Rooms ──
  const addRoom = () => {
    if (!newRName.trim()) { toast.error("Enter room name"); return; }
    setRooms(p=>[...p,{id:uid(),name:newRName.trim(),type:newRType,capacity:newRCap}]);
    setNewRName(""); setNewRCap(40);
    toast.success("Room added");
  };
  const addPresetRoom = (r: typeof ROOM_PRESETS[0]) => {
    if (rooms.find(x=>x.name===r.name)) return;
    setRooms(p=>[...p,{id:uid(),...r}]);
  };
  const removeRoom = (id:string) => setRooms(p=>p.filter(r=>r.id!==id));

  // ── Slots ──
  const addSlot = () => setSlots(p=>[...p,{startTime:"14:00",endTime:"14:45"}]);
  const removeSlot = (i:number) => setSlots(p=>p.filter((_,idx)=>idx!==i));
  const updateSlot = (i:number, field:keyof PeriodSlot, value:string|boolean) =>
    setSlots(p=>p.map((s,idx)=>idx===i?{...s,[field]:value}:s));

  // ── Generate ──
  const handleGenerate = useCallback(() => {
    if (subjects.length===0) { toast.error("Add at least one subject"); return; }
    if (teachableSlots===0)  { toast.error("Add at least one period slot"); return; }
    const { timetable:tt, conflicts:cf } = generateTimetable(subjects, teachers, rooms, slots, days, timetable);
    setTimetable(tt);
    setConflicts(cf);
    setStep("preview");
    if (cf.length>0) toast.warning(`Generated with ${cf.length} conflict(s) — check red cells`);
    else toast.success("Timetable generated with 0 conflicts ✓");
  }, [subjects, teachers, rooms, slots, days, timetable]);

  const handleRegenerate = () => {
    const { timetable:tt, conflicts:cf } = generateTimetable(subjects, teachers, rooms, slots, days, timetable);
    setTimetable(tt);
    setConflicts(cf);
    if (cf.length>0) toast.warning(`Reshuffled — ${cf.length} conflict(s) remain`);
    else toast.success("Reshuffled — 0 conflicts ✓");
  };

  // ── Toggle lock ──
  const toggleLock = (day:string, si:number) => {
    if (!timetable) return;
    setTimetable(prev=>{
      if (!prev) return prev;
      const updated = {...prev, [day]:[...prev[day]]};
      updated[day][si] = {...updated[day][si], locked:!updated[day][si].locked};
      return updated;
    });
  };

  // ── Edit cell ──
  const openEdit = (day:string, si:number) => {
    if (!timetable) return;
    const cell = timetable[day][si];
    if (cell.locked || cell.type==="break") return;
    setEditCell({day,si});
    setEditData({ subjectId:cell.subjectId||"", teacherId:cell.teacherId||"", roomId:cell.roomId||"" });
  };
  const applyEdit = () => {
    if (!editCell||!timetable) return;
    const sub  = subjects.find(s=>s.id===editData.subjectId);
    const tchr = teachers.find(t=>t.id===editData.teacherId);
    const room = rooms.find(r=>r.id===editData.roomId);
    const updated = {...timetable, [editCell.day]:[...timetable[editCell.day]]};
    updated[editCell.day][editCell.si] = {
      subjectId:   sub?.id||null,
      subjectName: sub?.name||"Free",
      shortName:   sub?.shortName||"FREE",
      color:       sub?.color||"#e2e8f0",
      type:        sub?.type||"free",
      teacherId:   tchr?.id||null,
      teacherName: tchr?.name||"",
      roomId:      room?.id||null,
      roomName:    room?.name||"",
      locked:      false,
      conflict:    false,
    };
    setTimetable(updated);
    // Re-detect conflicts
    const finalGrid = days.map(day => slots.map((_,si)=>updated[day][si]));
    setConflicts(detectConflicts(finalGrid, days, slots));
    setEditCell(null);
    toast.success("Cell updated");
  };

  // ── Swap two cells ──
  const [swapCell, setSwapCell] = useState<{day:string;si:number}|null>(null);
  const handleCellClick = (day:string, si:number) => {
    if (!timetable) return;
    const cell = timetable[day][si];
    if (cell.type==="break") return;
    if (swapCell) {
      if (swapCell.day===day && swapCell.si===si) { setSwapCell(null); return; }
      // perform swap
      const updated = {...timetable};
      const a = {...updated[swapCell.day][swapCell.si]};
      const b = {...updated[day][si]};
      updated[swapCell.day] = [...updated[swapCell.day]];
      updated[day] = [...updated[day]];
      updated[swapCell.day][swapCell.si] = {...b, locked:false};
      updated[day][si] = {...a, locked:false};
      setTimetable(updated);
      const finalGrid = days.map(d => slots.map((_,si2)=>updated[d][si2]));
      setConflicts(detectConflicts(finalGrid, days, slots));
      setSwapCell(null);
      toast.success("Periods swapped");
    } else {
      setSwapCell({day,si});
    }
  };

  // ── Teacher view: compute teacher schedule ──
  const teacherSchedule = useMemo(()=>{
    if (!timetable||viewMode!=="teacher") return null;
    const schedule: Record<string, Record<string, TimetableCell|null>> = {};
    teachers.forEach(t=>{
      schedule[t.id] = {};
      days.forEach(day=>{
        slots.forEach((slot,si)=>{
          const cell = timetable[day][si];
          if (cell?.teacherId===t.id) schedule[t.id][`${day}-${si}`] = cell;
        });
      });
    });
    return schedule;
  },[timetable, viewMode, teachers, days, slots]);

  // ── Wizard step meta ──
  const STEPS: {id:WizardStep; label:string; icon:React.ReactNode; sub:string}[] = [
    { id:"basics",   label:"Basics",    icon:<Settings2 className="h-4 w-4"/>,  sub:"School info & days" },
    { id:"teachers", label:"Teachers",  icon:<Users className="h-4 w-4"/>,      sub:"Staff & subjects" },
    { id:"subjects", label:"Subjects",  icon:<BookOpen className="h-4 w-4"/>,   sub:"All subjects" },
    { id:"rooms",    label:"Rooms",     icon:<Building2 className="h-4 w-4"/>,  sub:"Classrooms & labs" },
    { id:"slots",    label:"Time Slots",icon:<Clock className="h-4 w-4"/>,      sub:"Period timings" },
    { id:"preview",  label:"Timetable", icon:<Zap className="h-4 w-4"/>,        sub:"Generated schedule" },
  ];
  const stepOrder: WizardStep[] = ["basics","teachers","subjects","rooms","slots","preview"];
  const currentIdx = stepOrder.indexOf(step);

  const nextStep = () => { if (currentIdx<stepOrder.length-2) setStep(stepOrder[currentIdx+1]); };
  const prevStep = () => { if (currentIdx>0) setStep(stepOrder[currentIdx-1]); };

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-widest uppercase text-teal-500 mb-1">Principal Panel</p>
            <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
              Timetable Generator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full ERP-grade scheduler — teacher clash detection, room allocation, drag-swap & lock
            </p>
          </div>
          {conflicts.length>0 && step==="preview" && (
            <div className="flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-4 py-2 rounded-xl">
              <Shield className="h-4 w-4"/>
              {conflicts.length} conflict{conflicts.length>1?"s":""} detected
            </div>
          )}
          {conflicts.length===0 && timetable && step==="preview" && (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-4 py-2 rounded-xl">
              <CheckCircle2 className="h-4 w-4"/>
              No conflicts — clean schedule
            </div>
          )}
        </div>

        {/* ── Step nav ── */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex items-stretch gap-1 min-w-max bg-card border border-border rounded-2xl p-1.5 shadow-sm">
            {STEPS.map((s,i) => {
              const done = stepOrder.indexOf(s.id) < currentIdx;
              const active = s.id===step;
              const locked = s.id==="preview" && !timetable;
              return (
                <button key={s.id}
                  onClick={()=>{ if (!locked) setStep(s.id); }}
                  disabled={locked}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    active  ? "bg-teal-600 text-white shadow-md"
                    : done  ? "text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    : locked? "text-muted-foreground/70 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}>
                  {done && !active ? <CheckCircle2 className="h-4 w-4 text-teal-500"/> : s.icon}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden text-xs font-bold">{i+1}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════════════════════
            STEP 1 — BASICS
        ════════════════════════ */}
        {step==="basics" && (
          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <SectionTitle icon={<Settings2 className="h-5 w-5 text-teal-500"/>} title="School Configuration"/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
<Field label="School Name">
                  <Input
                    value={schoolName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchoolName(e.target.value)}
                    className="mt-1.5 h-11"
                  />
                </Field>
                <Field label="Academic Year">
<Input value={academicYear} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAcademicYear(e.target.value)} className="mt-1.5 h-11"/>
                </Field>
                <Field label="Class / Section">
                  <Input value={className} onChange={e=>setClassName(e.target.value)} placeholder="e.g. Class 10-A" className="mt-1.5 h-11"/>
                </Field>
                <Field label="Effective From">
                  <Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="mt-1.5 h-11"/>
                </Field>
              </div>
              <div>
                <Label className="text-sm font-semibold text-foreground/80 mb-3 block">Working Days</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                  {DAYS_OPTIONS.map(opt=>(
                    <button key={opt.value} onClick={()=>setTotalDays(opt.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${totalDays===opt.value?"border-teal-500 bg-teal-50 dark:bg-teal-900/20":"border-border hover:border-primary/40"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-foreground">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                        </div>
                        {totalDays===opt.value&&<CheckCircle2 className="h-5 w-5 text-teal-500"/>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <NavRow onNext={nextStep} nextLabel="Add Teachers"/>
            </CardContent>
          </Card>
        )}

        {/* ════════════════════════
            STEP 2 — TEACHERS
        ════════════════════════ */}
        {step==="teachers" && (
          <div className="space-y-5">
            {/* Presets */}
            <Card>
              <CardContent className="p-6 sm:p-8">
                <SectionTitle icon={<Users className="h-5 w-5 text-teal-500"/>} title="Add Teachers"/>
                <p className="text-xs text-muted-foreground mb-4">Quick add from presets or add custom teachers below</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {PRESET_TEACHERS.map(pt=>{
                    const already = teachers.some(t=>t.name===pt.name);
                    return (
                      <button key={pt.name} onClick={()=>addPresetTeacher(pt)} disabled={already}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${already?"bg-muted text-muted-foreground border-border cursor-not-allowed":"bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 hover:bg-teal-100"}`}>
                        {already?"✓ ":"+ "}{pt.name}
                      </button>
                    );
                  })}
                </div>

                {/* Add custom */}
                <div className="flex flex-wrap gap-3 items-end p-4 bg-muted/50 rounded-xl border border-border">
                  <div className="flex-1 min-w-48">
                    <Label className="text-xs text-muted-foreground mb-1 block">Full Name *</Label>
                    <Input value={newTName} onChange={e=>setNewTName(e.target.value)} placeholder="Mr. / Ms. ..." className="h-10 text-sm" onKeyDown={e=>e.key==="Enter"&&addTeacher()}/>
                  </div>
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground mb-1 block">Short Code</Label>
                    <Input value={newTShort} onChange={e=>setNewTShort(e.target.value.toUpperCase())} placeholder="ABC" maxLength={4} className="h-10 text-sm"/>
                  </div>
                  <Button onClick={addTeacher} className="h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm px-5">
                    <Plus className="h-4 w-4 mr-1"/>Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Teacher list */}
            {teachers.length>0 && (
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <p className="text-sm font-bold text-foreground mb-4">{teachers.length} Teacher{teachers.length>1?"s":""} Added</p>
                  <div className="space-y-3">
                    {teachers.map(t=>(
                      <div key={t.id} className="p-4 rounded-xl bg-muted/50 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-extrabold text-teal-700 dark:text-teal-400">{t.shortName}</div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{t.subjectIds.length} subject{t.subjectIds.length!==1?"s":""} assigned</p>
                            </div>
                          </div>
                          <button onClick={()=>removeTeacher(t.id)} className="text-red-400 hover:text-red-600 p-1">
                            <Trash2 className="h-4 w-4"/>
                          </button>
                        </div>
                        {subjects.length>0&&(
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {subjects.map(s=>{
                              const assigned = t.subjectIds.includes(s.id);
                              return (
                                <button key={s.id} onClick={()=>assignTeacherSubject(t.id,s.id,!assigned)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${assigned?"text-white border-transparent":  "bg-card text-muted-foreground border-border hover:border-primary/40"}`}
                                  style={assigned?{backgroundColor:s.color, borderColor:s.color}:{}}>
                                  {assigned?"✓ ":""}{s.shortName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {subjects.length===0&&<p className="text-xs text-muted-foreground italic">Add subjects first to assign</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <NavRow onPrev={prevStep} onNext={nextStep} nextLabel="Add Subjects" canNext/>
          </div>
        )}

        {/* ════════════════════════
            STEP 3 — SUBJECTS
        ════════════════════════ */}
        {step==="subjects" && (
          <div className="space-y-5">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <SectionTitle icon={<BookOpen className="h-5 w-5 text-teal-500"/>} title="Subjects & Activities"/>
                <p className="text-xs text-muted-foreground mb-4">Quick add presets or define custom subjects</p>

                {/* Presets */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {PRESET_SUBJECTS.map(p=>{
                    const already = subjects.some(s=>s.name===p.name);
                    return (
                      <button key={p.name} onClick={()=>addPresetSubject(p)} disabled={already}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${already?"bg-muted text-muted-foreground border-border cursor-not-allowed":p.type==="extracurricular"?"bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100":"bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"}`}>
                        {already?"✓ ":"+ "}{p.name}{p.requiresLab?" 🔬":""}
                      </button>
                    );
                  })}
                </div>

                {/* Custom form */}
                <div className="p-4 bg-muted/50 rounded-xl border border-border space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Subject Name *</Label>
                      <Input value={newSName} onChange={e=>setNewSName(e.target.value)} placeholder="e.g. Yoga" className="h-10 text-sm" onKeyDown={e=>e.key==="Enter"&&addSubject()}/>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Short Code</Label>
                      <Input value={newSShort} onChange={e=>setNewSShort(e.target.value.toUpperCase())} placeholder="YOG" maxLength={5} className="h-10 text-sm"/>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                      <Select value={newSType} onValueChange={v=>setNewSType(v as SubjectType)}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue/></SelectTrigger>
                        <SelectContent className="bg-background text-foreground border-border">
                          <SelectItem value="academic">📚 Academic</SelectItem>
                          <SelectItem value="extracurricular">🏃 Extra Curricular</SelectItem>
                          <SelectItem value="free">🕊️ Free Period</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Periods / Week</Label>
                      <Input type="number" min={1} max={30} value={newSPeriods} onChange={e=>setNewSPeriods(Number(e.target.value))} className="h-10 text-sm"/>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Assign Teacher</Label>
                      <Select value={newSTeacher} onValueChange={setNewSTeacher}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="— optional —"/></SelectTrigger>
                        <SelectContent className="bg-background text-foreground border-border">
                          {teachers.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3 pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={newSLab} onChange={e=>setNewSLab(e.target.checked)} className="w-4 h-4 accent-teal-600 rounded"/>
                        <span className="text-sm text-foreground/80">Requires Lab 🔬</span>
                      </label>
                    </div>
                  </div>
                  <Button onClick={addSubject} className="h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm px-5">
                    <Plus className="h-4 w-4 mr-1"/>Add Subject
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Subject list */}
            {subjects.length>0&&(
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <p className="font-bold text-foreground">{subjects.length} Subject{subjects.length>1?"s":""}</p>
                    <SlotBadge used={totalNeeded} total={availableWeek} overloaded={isOverloaded}/>
                  </div>
                  <div className="space-y-2">
                    {subjects.map(s=>{
                      const assignedTeacher = teachers.find(t=>t.subjectIds.includes(s.id));
                      return (
                        <div key={s.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/50 border border-border">
                          <div className="w-3 h-9 rounded-full flex-shrink-0" style={{backgroundColor:s.color}}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{s.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_META[s.type].tw}`}>{TYPE_META[s.type].icon} {TYPE_META[s.type].label}</span>
                              {s.requiresLab&&<span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">🔬 Lab</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {s.periodsPerWeek} periods/week · {assignedTeacher?assignedTeacher.name:"No teacher assigned"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={()=>setSubjects(p=>p.map(x=>x.id===s.id?{...x,periodsPerWeek:Math.max(1,x.periodsPerWeek-1)}:x))} className="w-7 h-7 rounded-lg bg-muted font-bold text-sm flex items-center justify-center hover:bg-gray-300">−</button>
                            <span className="w-5 text-center text-sm font-bold text-foreground">{s.periodsPerWeek}</span>
                            <button onClick={()=>setSubjects(p=>p.map(x=>x.id===s.id?{...x,periodsPerWeek:x.periodsPerWeek+1}:x))} className="w-7 h-7 rounded-lg bg-muted font-bold text-sm flex items-center justify-center hover:bg-gray-300">+</button>
                            <button onClick={()=>removeSubject(s.id)} className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center ml-1">
                              <Trash2 className="h-3.5 w-3.5"/>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            <NavRow onPrev={prevStep} onNext={nextStep} nextLabel="Add Rooms" canNext={subjects.length>0}/>
          </div>
        )}

        {/* ════════════════════════
            STEP 4 — ROOMS
        ════════════════════════ */}
        {step==="rooms" && (
          <div className="space-y-5">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <SectionTitle icon={<Building2 className="h-5 w-5 text-teal-500"/>} title="Classrooms & Labs"/>
                <p className="text-xs text-muted-foreground mb-4">Add rooms for conflict detection. Skip if not needed.</p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {ROOM_PRESETS.map(r=>{
                    const already=rooms.some(x=>x.name===r.name);
                    const col = r.type==="lab"?"bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-100":r.type==="hall"?"bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100":"bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100";
                    return (
                      <button key={r.name} onClick={()=>addPresetRoom(r)} disabled={already}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${already?"bg-muted text-muted-foreground border-border cursor-not-allowed":col}`}>
                        {already?"✓ ":"+ "}{r.name}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3 items-end p-4 bg-muted/50 rounded-xl border border-border">
                  <div className="flex-1 min-w-36">
                    <Label className="text-xs text-muted-foreground mb-1 block">Room Name *</Label>
                    <Input value={newRName} onChange={e=>setNewRName(e.target.value)} placeholder="e.g. Room 201" className="h-10 text-sm"/>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                    <Select value={newRType} onValueChange={v=>setNewRType(v as Room["type"])}>
                      <SelectTrigger className="h-10 text-sm w-36"><SelectValue/></SelectTrigger>
                      <SelectContent className="bg-background text-foreground border-border">
                        <SelectItem value="classroom">🏫 Classroom</SelectItem>
                        <SelectItem value="lab">🔬 Lab</SelectItem>
                        <SelectItem value="hall">🏛️ Hall</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground mb-1 block">Capacity</Label>
                    <Input type="number" value={newRCap} onChange={e=>setNewRCap(Number(e.target.value))} className="h-10 text-sm"/>
                  </div>
                  <Button onClick={addRoom} className="h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm px-5">
                    <Plus className="h-4 w-4 mr-1"/>Add
                  </Button>
                </div>

                {rooms.length>0&&(
                  <div className="mt-4 space-y-2">
                    {rooms.map(r=>(
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{r.type==="lab"?"🔬":r.type==="hall"?"🏛️":"🏫"}</span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{r.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{r.type} · {r.capacity} seats</p>
                          </div>
                        </div>
                        <button onClick={()=>removeRoom(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="h-4 w-4"/></button>
                      </div>
                    ))}
                  </div>
                )}
                {rooms.length===0&&<p className="text-xs text-muted-foreground italic mt-3">No rooms added — room clash detection will be skipped</p>}
              </CardContent>
            </Card>
            <NavRow onPrev={prevStep} onNext={nextStep} nextLabel="Configure Time Slots" canNext/>
          </div>
        )}

        {/* ════════════════════════
            STEP 5 — SLOTS
        ════════════════════════ */}
        {step==="slots" && (
          <div className="space-y-5">
            <Card>
              <CardContent className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <SectionTitle icon={<Clock className="h-5 w-5 text-teal-500"/>} title="Period Time Slots"/>
                  <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full font-semibold">
                    {slots.filter(s=>!s.isBreak).length} periods · {slots.filter(s=>s.isBreak).length} breaks
                  </div>
                </div>
                <div className="space-y-2">
                  {slots.map((slot,i)=>{
                    const periodNum = slots.slice(0,i).filter(s=>!s.isBreak).length+1;
                    return (
                      <div key={i} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 rounded-xl border ${slot.isBreak?"bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40":"bg-muted/50 border-border"}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${slot.isBreak?"bg-amber-100 dark:bg-amber-900/30 text-amber-600":"bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"}`}>
                          {slot.isBreak?<Coffee className="h-4 w-4"/>:periodNum}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="time" value={slot.startTime} onChange={e=>updateSlot(i,"startTime",e.target.value)}
                            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:ring-2 focus:ring-teal-400 outline-none"/>
                          <span className="text-muted-foreground text-xs">–</span>
                          <input type="time" value={slot.endTime} onChange={e=>updateSlot(i,"endTime",e.target.value)}
                            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:ring-2 focus:ring-teal-400 outline-none"/>
                        </div>
                        <input type="text" value={slot.label||""} onChange={e=>updateSlot(i,"label",e.target.value)}
                          placeholder={slot.isBreak?"Break name":"Optional label"}
                          className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground/80 focus:ring-2 focus:ring-teal-400 outline-none flex-1 min-w-0"/>
                        <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                          <input type="checkbox" checked={!!slot.isBreak} onChange={e=>updateSlot(i,"isBreak",e.target.checked)} className="w-4 h-4 accent-amber-500 rounded"/>
                          <span className="text-xs text-muted-foreground">Break</span>
                        </label>
                        <button onClick={()=>removeSlot(i)} className="w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                          <Trash2 className="h-3.5 w-3.5"/>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" onClick={addSlot} className="border-dashed border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 h-10 px-5 rounded-xl text-sm font-semibold">
                  <Plus className="h-4 w-4 mr-1.5"/>Add Period / Break
                </Button>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    {label:"Working Days",       value:days.length, color:"text-foreground"},
                    {label:"Periods / Day",      value:teachableSlots, color:"text-foreground"},
                    {label:"Total Slots / Week", value:availableWeek, color:"text-foreground"},
                    {label:"Periods Needed",     value:totalNeeded, color:isOverloaded?"text-red-500":"text-emerald-600"},
                  ].map(s=>(
                    <div key={s.label} className="bg-muted/50 rounded-xl p-3">
                      <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {isOverloaded&&(
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mt-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0"/>
                    {totalNeeded} periods needed but only {availableWeek} slots available. Some subjects may be partially placed.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={prevStep} className="h-11 px-6 rounded-xl gap-2">
                <ChevronLeft className="h-4 w-4"/>Back
              </Button>
              <Button onClick={handleGenerate} className="h-11 px-8 rounded-xl font-bold text-sm gap-2 bg-teal-600 hover:bg-teal-700 text-white">
                <Wand2 className="h-4 w-4"/>Generate Timetable
              </Button>
            </div>
          </div>
        )}

        {/* ════════════════════════
            STEP 6 — PREVIEW
        ════════════════════════ */}
        {step==="preview" && timetable && (
          <div className="space-y-5">
            {/* Toolbar */}
            <Card>
              <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold text-foreground text-lg">{schoolName}</p>
                  <p className="text-sm text-muted-foreground">{className} · {academicYear}{startDate?` · From ${startDate}`:""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* View mode */}
                  <div className="flex bg-muted rounded-xl p-1 gap-1">
                    {(["grid","teacher"] as const).map(v=>(
                      <button key={v} onClick={()=>setViewMode(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${viewMode===v?"bg-card text-foreground shadow-sm":"text-muted-foreground"}`}>
                        {v==="grid"?"📅 Grid":"👨‍🏫 Teacher View"}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={()=>setStep("slots")} className="h-9 text-xs rounded-xl gap-1.5">
                    <Settings2 className="h-3.5 w-3.5"/>Edit Config
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRegenerate} className="h-9 text-xs rounded-xl gap-1.5 text-teal-600 border-teal-300 dark:border-teal-700 hover:bg-teal-50">
                    <RotateCcw className="h-3.5 w-3.5"/>Regenerate
                  </Button>
                  <Button size="sm" onClick={()=>toast.success("Timetable saved!")} className="h-9 text-xs rounded-xl gap-1.5 bg-teal-600 hover:bg-teal-700 text-white">
                    <Download className="h-3.5 w-3.5"/>Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Conflicts panel */}
            {conflicts.length>0&&(
              <Card className="border-l-4 border-red-500">
                <CardContent className="p-4 sm:p-5">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4"/>{conflicts.length} Conflict{conflicts.length>1?"s":""} Detected
                  </p>
                  <div className="space-y-1.5">
                    {conflicts.map((c,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/10 rounded-lg px-3 py-2">
                        <span className="font-bold uppercase text-red-400">{c.type==="teacher_clash"?"👤":"🏫"}</span>
                        {c.message}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Fix by clicking a red cell to reassign, or Regenerate for a fresh attempt.</p>
                </CardContent>
              </Card>
            )}

            {/* Swap mode banner */}
            {swapCell&&(
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300 font-semibold">
                <ArrowLeftRight className="h-4 w-4 flex-shrink-0"/>
                Swap mode: now click another cell to swap · or <button onClick={()=>setSwapCell(null)} className="underline ml-1">Cancel</button>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-2">
              {subjects.map(s=>(
                <div key={s.id} className="flex items-center gap-1.5 text-xs bg-card border border-border rounded-full px-3 py-1.5 shadow-sm">
                  <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:s.color}}/>
                  <span className="text-foreground/80 font-medium">{s.name}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs bg-card border border-border rounded-full px-3 py-1.5 shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
                <span className="text-muted-foreground">Conflict</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs bg-card border border-border rounded-full px-3 py-1.5 shadow-sm">
                <Lock className="h-3 w-3 text-teal-500"/>
                <span className="text-muted-foreground">Locked</span>
              </div>
            </div>

            {/* ── GRID VIEW ── */}
            {viewMode==="grid"&&(
              <>
                {/* Desktop table */}
                <Card className="hidden md:block overflow-hidden">
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full border-collapse" style={{minWidth:`${180 + days.length*130}px`}}>
                      <thead>
                        <tr className="bg-gray-950 dark:bg-black">
                          <th className="text-left px-5 py-4 text-xs font-extrabold uppercase tracking-widest text-muted-foreground w-36 border-r border-gray-800">
                            Period
                          </th>
                          {days.map(day=>(
                            <th key={day} className="px-3 py-4 text-xs font-extrabold uppercase tracking-widest text-muted-foreground/70 text-center border-r border-gray-800 last:border-r-0">
                              {day.slice(0,3).toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((slot,si)=>{
                          const periodNum = slots.slice(0,si).filter(s=>!s.isBreak).length+1;
                          return (
                            <tr key={si} className={`border-b border-border ${slot.isBreak?"bg-amber-50/70 dark:bg-amber-900/10":"hover:bg-accent/40"}`}>
                              <td className="px-5 py-3 border-r border-border">
                                {slot.isBreak
                                  ? <div className="flex items-center gap-1.5"><Coffee className="h-3.5 w-3.5 text-amber-500"/><span className="text-xs font-bold text-amber-600 dark:text-amber-400">{slot.label||"Break"}</span></div>
                                  : <>
                                      <div className="text-xs font-extrabold text-muted-foreground">P{periodNum}</div>
                                      <div className="text-xs font-semibold text-foreground/80">{slot.startTime}</div>
                                      <div className="text-xs text-muted-foreground">{slot.endTime}</div>
                                    </>
                                }
                              </td>
                              {days.map(day=>{
                                const cell = timetable[day]?.[si];
                                if (!cell) return <td key={day} className="px-3 py-2 border-r border-border last:border-r-0"/>;
                                const isBreakCell = cell.type==="break";
                                const isFree = !cell.subjectId || cell.type==="free";
                                const isSwapSrc = swapCell?.day===day&&swapCell?.si===si;
                                return (
                                  <td key={day}
                                    className={`px-2 py-2 border-r border-border last:border-r-0 ${isBreakCell?"text-center":"cursor-pointer group"}`}
                                    onClick={()=>!isBreakCell&&handleCellClick(day,si)}>
                                    {isBreakCell
                                      ? <div className="text-center text-xs text-amber-500 font-bold py-0.5">☕</div>
                                      : <div className={`relative rounded-xl p-2.5 transition-all group-hover:shadow-md ${
                                          isSwapSrc?"ring-2 ring-amber-400 scale-105"
                                          : cell.conflict?"ring-2 ring-red-400"
                                          : cell.locked?"ring-2 ring-teal-400"
                                          : ""
                                        }`}
                                          style={{
                                            backgroundColor: isFree?"#f1f5f9 ":cell.color+"1a",
                                            borderLeft:`3px solid ${isFree?"#cbd5e1":cell.conflict?"#f87171":cell.color}`
                                          }}>
                                          <div className="flex items-start justify-between gap-1">
                                            <p className="text-xs font-extrabold leading-tight truncate" style={{color:isFree?"#94a3b8":cell.conflict?"#dc2626":cell.color}}>
                                              {isFree?"Free":cell.shortName}
                                            </p>
                                            <div className="flex gap-0.5 flex-shrink-0">
                                              {cell.locked&&<Lock className="h-2.5 w-2.5 text-teal-500"/>}
                                              {cell.conflict&&<AlertTriangle className="h-2.5 w-2.5 text-red-500"/>}
                                            </div>
                                          </div>
                                          {!isFree&&(
                                            <p className="text-xs font-medium text-muted-foreground mt-0.5 leading-tight truncate" style={{fontSize:"0.65rem"}}>
                                              {cell.teacherName?cell.teacherName.split(" ").at(-1):"—"}
                                            </p>
                                          )}
                                          {!isFree&&cell.roomName&&(
                                            <p className="text-muted-foreground mt-0.5 leading-tight truncate" style={{fontSize:"0.6rem"}}>{cell.roomName}</p>
                                          )}
                                          {/* Hover actions */}
                                          <div className="absolute inset-0 rounded-xl bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                            <button onClick={e=>{e.stopPropagation();openEdit(day,si);}} className="bg-card rounded-lg p-1 shadow text-muted-foreground hover:text-teal-600">
                                              <Pencil className="h-3 w-3"/>
                                            </button>
                                            <button onClick={e=>{e.stopPropagation();toggleLock(day,si);}} className={`bg-card rounded-lg p-1 shadow ${cell.locked?"text-teal-600":"text-muted-foreground"}`}>
                                              {cell.locked?<Lock className="h-3 w-3"/>:<Unlock className="h-3 w-3"/>}
                                            </button>
                                            <button onClick={e=>{e.stopPropagation();handleCellClick(day,si);}} className="bg-card rounded-lg p-1 shadow text-muted-foreground hover:text-amber-500">
                                              <ArrowLeftRight className="h-3 w-3"/>
                                            </button>
                                          </div>
                                        </div>
                                    }
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Mobile: tab per day */}
                <div className="md:hidden">
                  <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
                    {days.map((day,di)=>(
                      <button key={day} onClick={()=>setActiveDay(di)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeDay===di?"bg-teal-600 text-white":"bg-card text-muted-foreground border border-border"}`}>
                        {day.slice(0,3)}
                      </button>
                    ))}
                  </div>
                  <Card className="overflow-hidden">
                    <div className="bg-gray-950 px-5 py-3">
                      <p className="font-extrabold text-white text-sm tracking-widest uppercase">{days[activeDay]}</p>
                    </div>
                    <CardContent className="p-4 space-y-2">
                      {slots.map((slot,si)=>{
                        const cell = timetable[days[activeDay]]?.[si];
                        if (!cell) return null;
                        const isBreakCell=cell.type==="break";
                        const isFree=!cell.subjectId||cell.type==="free";
                        return (
                          <div key={si}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${isBreakCell?"bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40":cell.conflict?"border-red-300 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 cursor-pointer":"bg-muted/50 border-border cursor-pointer"}`}
                            onClick={()=>!isBreakCell&&openEdit(days[activeDay],si)}>
                            <div className="text-xs text-muted-foreground w-16 flex-shrink-0">
                              <div className="font-bold">{slot.startTime}</div>
                              <div>{slot.endTime}</div>
                            </div>
                            {isBreakCell
                              ? <span className="text-xs font-bold text-amber-600">☕ {cell.subjectName}</span>
                              : <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div className="w-1.5 h-9 rounded-full flex-shrink-0" style={{backgroundColor:isFree?"#cbd5e1":cell.conflict?"#f87171":cell.color}}/>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate">{isFree?"Free Period":cell.subjectName}</p>
                                    <p className="text-xs text-muted-foreground truncate">{cell.teacherName||""}{cell.roomName?` · ${cell.roomName}`:""}</p>
                                  </div>
                                  <div className="ml-auto flex items-center gap-1">
                                    {cell.conflict&&<AlertTriangle className="h-3.5 w-3.5 text-red-500"/>}
                                    {cell.locked&&<Lock className="h-3.5 w-3.5 text-teal-500"/>}
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground/70"/>
                                  </div>
                                </div>
                            }
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* ── TEACHER VIEW ── */}
            {viewMode==="teacher"&&teacherSchedule&&(
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <p className="text-sm font-bold text-foreground/80">Filter:</p>
                  <button onClick={()=>setTeacherFilter("all")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${teacherFilter==="all"?"bg-teal-600 text-white border-teal-600":"bg-card text-muted-foreground border-border hover:border-primary/40"}`}>
                    All Teachers
                  </button>
                  {teachers.map(t=>(
                    <button key={t.id} onClick={()=>setTeacherFilter(t.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${teacherFilter===t.id?"bg-teal-600 text-white border-teal-600":"bg-card text-muted-foreground border-border hover:border-primary/40"}`}>
                      {t.shortName}
                    </button>
                  ))}
                </div>
                {teachers.filter(t=>teacherFilter==="all"||t.id===teacherFilter).map(t=>{
                  const totalPeriods = Object.values(teacherSchedule[t.id]||{}).filter(Boolean).length;
                  return (
                    <Card key={t.id} className="overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-muted border-b border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-extrabold text-teal-700 dark:text-teal-400">{t.shortName}</div>
                          <div>
                            <p className="font-bold text-sm text-foreground">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{totalPeriods} periods this week</p>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-0 overflow-x-auto">
                        <table className="w-full border-collapse text-xs" style={{minWidth:`${140+days.length*100}px`}}>
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left px-4 py-2 text-muted-foreground font-bold w-28 border-r border-border">Time</th>
                              {days.map(day=><th key={day} className="px-3 py-2 text-muted-foreground font-bold text-center border-r border-border last:border-r-0">{day.slice(0,3)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {slots.filter(s=>!s.isBreak).map((slot,rawSi)=>{
                              const si = slots.indexOf(slot);
                              return (
                                <tr key={si} className="border-b border-border">
                                  <td className="px-4 py-2 border-r border-border">
                                    <span className="font-semibold text-foreground/80">{slot.startTime}</span>
                                  </td>
                                  {days.map(day=>{
                                    const cell = timetable[day][si];
                                    const isMe = cell?.teacherId===t.id;
                                    return (
                                      <td key={day} className="px-2 py-1.5 border-r border-border last:border-r-0">
                                        {isMe
                                          ? <div className="rounded-lg px-2 py-1.5 text-center" style={{backgroundColor:cell!.color+"22",borderLeft:`2px solid ${cell!.color}`}}>
                                              <p className="font-bold" style={{color:cell!.color}}>{cell!.shortName}</p>
                                              {cell!.roomName&&<p className="text-muted-foreground mt-0.5" style={{fontSize:"0.6rem"}}>{cell!.roomName}</p>}
                                            </div>
                                          : <div className="rounded-lg px-2 py-1.5 text-center bg-muted/50">
                                              <p className="text-muted-foreground/70 font-bold">—</p>
                                            </div>
                                        }
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  );
                })}
                {teachers.length===0&&<p className="text-sm text-muted-foreground text-center py-8">No teachers added. Go back to Step 2 to add teachers.</p>}
              </div>
            )}

            {/* Stats footer */}
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">Weekly Subject Distribution</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {subjects.map(s=>{
                    const placed = Object.values(timetable).reduce((acc,dayCells)=>acc+dayCells.filter(c=>c.subjectId===s.id).length,0);
                    const pct = s.periodsPerWeek>0?Math.round((placed/s.periodsPerWeek)*100):100;
                    return (
                      <div key={s.id} className="bg-muted/50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:s.color}}/>
                          <p className="text-xs font-bold text-foreground truncate">{s.shortName}</p>
                          {placed<s.periodsPerWeek&&<AlertCircle className="h-3 w-3 text-amber-400 flex-shrink-0 ml-auto"/>}
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${Math.min(pct,100)}%`,backgroundColor:s.color}}/>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{placed}/{s.periodsPerWeek} periods</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center pb-4">
              💡 Hover cell → <b>Edit</b> · <b>Lock</b> · <b>Swap</b> &nbsp;|&nbsp; Red = Conflict &nbsp;|&nbsp; 🔒 = Locked (survives Regenerate)
            </p>
          </div>
        )}

        {/* ── Edit Cell Dialog ── */}
        {editCell&&(
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={()=>setEditCell(null)}>
            <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-foreground">Edit Period</h3>
                <button onClick={()=>setEditCell(null)} className="text-muted-foreground hover:text-gray-600"><X className="h-5 w-5"/></button>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">{editCell.day} · {slots[editCell.si]?.startTime} – {slots[editCell.si]?.endTime}</p>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Subject</Label>
                  <Select value={editData.subjectId} onValueChange={v=>setEditData(d=>({...d,subjectId:v}))}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select subject"/></SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      {subjects.map(s=><SelectItem key={s.id} value={s.id}>{TYPE_META[s.type].icon} {s.name}</SelectItem>)}
                      <SelectItem value="">🕊️ Free Period</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Teacher</Label>
                  <Select value={editData.teacherId} onValueChange={v=>setEditData(d=>({...d,teacherId:v}))}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="— optional —"/></SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      {teachers.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      <SelectItem value="">No teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Room</Label>
                  <Select value={editData.roomId} onValueChange={v=>setEditData(d=>({...d,roomId:v}))}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="— optional —"/></SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      {rooms.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      <SelectItem value="">No room</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={()=>setEditCell(null)} className="flex-1 rounded-xl h-11">Cancel</Button>
                <Button onClick={applyEdit} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl h-11 font-bold">Apply</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  SMALL HELPERS
// ═══════════════════════════════════════════════════════════

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2 mb-2">
      {icon}{title}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm font-semibold text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

function NavRow({
  onPrev, onNext, nextLabel = "Continue", canNext = true
}: { onPrev?: ()=>void; onNext?: ()=>void; nextLabel?: string; canNext?: boolean }) {
  return (
    <div className="flex gap-3 pt-1">
      {onPrev&&(
        <Button variant="outline" onClick={onPrev} className="h-11 px-6 rounded-xl gap-2">
          <ChevronLeft className="h-4 w-4"/>Back
        </Button>
      )}
      {onNext&&(
        <Button onClick={onNext} disabled={!canNext}
          className="h-11 px-8 rounded-xl font-bold text-sm gap-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40">
          {nextLabel}<ChevronRight className="h-4 w-4"/>
        </Button>
      )}
    </div>
  );
}

function SlotBadge({ used, total, overloaded }: { used:number; total:number; overloaded:boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${overloaded?"bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800":"bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"}`}>
      {overloaded?<AlertCircle className="h-3.5 w-3.5"/>:<CheckCircle2 className="h-3.5 w-3.5"/>}
      {used} / {total} slots
    </div>
  );
}
