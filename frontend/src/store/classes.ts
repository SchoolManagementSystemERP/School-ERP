/**
 * Classes (grades) and sections, from the API (GET /grades). The pages keep using numeric ids and
 * class names like "Class 10-A"; the GUIDs live in the id registry.
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { toast } from "sonner";
import { mutate, remoteCollection, tempId } from "./remote";

/** A grade offered by the school, e.g. "Class 10" (English medium). */
export interface GradeClass {
  id: number;
  className: string;
  medium: string;
  academicYear: string;
}

/** A section of a grade, e.g. "Class 10" + "A" = "Class 10-A". */
export interface Section {
  id: number;
  className: string;
  section: string;
  academicYear: string;
  classTeacher: string;
  medium: string;
  capacity: number;
}

interface ApiGrade {
  id: string;
  name: string;
  sortOrder: number;
  medium: string | null;
  sections: { id: string; name: string; capacity: number; classTeacherId: string | null; enrolled: number }[];
}

/** Class-teacher names are resolved through the teacher store (set by teachers.ts to avoid an import cycle). */
let teacherName: (staffGuid: string) => string = () => "";
let teacherGuidByName: (name: string) => string | null = () => null;
export function connectTeacherNames(byGuid: typeof teacherName, byName: typeof teacherGuidByName) {
  teacherName = byGuid;
  teacherGuidByName = byName;
}

let gradesRequest: Promise<{ grades: ApiGrade[]; year: string }> | null = null;
function fetchGrades() {
  gradesRequest ??= Promise.all([api.get<ApiGrade[]>("/grades"), api.get<{ name: string; isCurrent: boolean }[]>("/academic-years")])
    .then(([grades, years]) => ({ grades, year: years.find((y) => y.isCurrent)?.name ?? years[0]?.name ?? "" }))
    .finally(() => setTimeout(() => { gradesRequest = null; }, 0));
  return gradesRequest;
}

export let currentAcademicYear = "";

const gradeBase = remoteCollection<GradeClass>("grades", async () => {
  const { grades, year } = await fetchGrades();
  currentAcademicYear = year;
  return grades.map((g) => ({ id: numId("grade", g.id), className: g.name, medium: g.medium ?? "English", academicYear: year }));
});

const sectionBase = remoteCollection<Section>("sections", async () => {
  const { grades, year } = await fetchGrades();
  return grades.flatMap((g) =>
    g.sections.map((s) => ({
      id: numId("section", s.id), className: g.name, section: s.name, academicYear: year, medium: g.medium ?? "English",
      capacity: s.capacity, classTeacher: s.classTeacherId ? teacherName(s.classTeacherId) : "",
    })),
  );
});

/** "Class 10" + "A" → "Class 10-A" (the name students and pages use). */
export const sectionName = (s: Pick<Section, "className" | "section">) => `${s.className}-${s.section}`;

/** GUID of a section from its name ("Class 10-A"). */
export function sectionGuid(className: string) {
  const s = sectionBase.getAll().find((x) => sectionName(x) === className);
  return s ? maybeGuid("section", s.id) : undefined;
}

export const useGrades = () => gradeBase.useItems();
export const useSections = () => sectionBase.useItems();

const gradeNumber = (className: string) => Number(className.replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

// ── Changes (same calls the setup pages already make) ─────────────────────────

export const gradeStore = Object.assign(gradeBase, {
  add(record: Omit<GradeClass, "id">) {
    const id = tempId();
    const created = { ...record, id };
    void mutate(gradeBase, (l) => [...l, created], async () => {
      const g = await api.post<ApiGrade>("/grades", { name: record.className.trim(), sortOrder: gradeNumber(record.className), medium: record.medium || null, sections: [] });
      gradeBase.set((l) => l.map((x) => (x.id === id ? { ...x, id: numId("grade", g.id) } : x)));
    });
    return created;
  },
  update(record: GradeClass) {
    void mutate(gradeBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () =>
      api.patch(`/grades/${guidOf("grade", record.id)}`, { name: record.className.trim(), sortOrder: gradeNumber(record.className), medium: record.medium || null }),
    { reload: true });
  },
  remove(id: number) {
    void mutate(gradeBase, (l) => l.filter((x) => x.id !== id), () => api.del(`/grades/${guidOf("grade", id)}`));
  },
});

export const sectionStore = Object.assign(sectionBase, {
  add(record: Omit<Section, "id">) {
    const id = tempId();
    const created = { ...record, id };
    const grade = gradeBase.getAll().find((g) => g.className === record.className);
    if (!grade || grade.id < 0) {
      toast.error(`Create ${record.className} first.`);
      return created;
    }
    void mutate(sectionBase, (l) => [...l, created], async () => {
      const s = await api.post<{ id: string }>(`/grades/${guidOf("grade", grade.id)}/sections`, {
        name: record.section, capacity: record.capacity, classTeacherId: record.classTeacher ? teacherGuidByName(record.classTeacher) : null,
      });
      sectionBase.set((l) => l.map((x) => (x.id === id ? { ...x, id: numId("section", s.id) } : x)));
    });
    return created;
  },
  update(record: Section) {
    void mutate(sectionBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () =>
      api.patch(`/sections/${guidOf("section", record.id)}`, { name: record.section, capacity: record.capacity, classTeacherId: record.classTeacher ? teacherGuidByName(record.classTeacher) : null }),
    );
  },
  remove(id: number) {
    void mutate(sectionBase, (l) => l.filter((x) => x.id !== id), () => api.del(`/sections/${guidOf("section", id)}`));
  },
});

