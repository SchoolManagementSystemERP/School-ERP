/**
 * Study notes, from the API (GET /notes). Teachers upload, students download, the principal oversees.
 * The database keeps the file's details; the file contents are not stored yet.
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { today } from "@/lib/dates";
import type { StudyNote } from "@/types/note";
import { mayRead } from "./auth";
import { classNameOfSection, teacherGuidByName } from "./assignments";
import { sectionGuid, sectionStore } from "./classes";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";
import { teacherStore } from "./teachers";
import { requireSubject } from "./timetable";

interface ApiNote {
  id: string; sectionId: string; subjectName: string; title: string; description: string | null;
  fileName: string; sizeBytes: number; mimeType: string; uploadedBy: string; downloads: number; createdAt: string;
}

/** Human-readable size for an uploaded file. */
export function formatFileSize(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const bytesOf = (size: string) => {
  const m = size.match(/([\d.]+)\s*(KB|MB|GB)/i);
  return m ? Math.round(Number(m[1]) * { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2].toUpperCase() as "KB" | "MB" | "GB"]) : 0;
};

const toNote = (n: ApiNote): StudyNote => ({
  id: numId("note", n.id),
  title: n.title,
  subject: n.subjectName,
  class: classNameOfSection(n.sectionId),
  description: n.description ?? "",
  fileName: n.fileName,
  fileSize: formatFileSize(n.sizeBytes),
  uploadDate: n.createdAt,
  uploadedBy: n.uploadedBy,
  downloads: n.downloads,
});

export const noteStore = remoteStore<StudyNote[]>("notes", [], async () => {
  await Promise.all([sectionStore.load(), teacherStore.load()]);
  if (!mayRead("students.read")) return [];
  return (await ifAllowed(api.get<ApiNote[]>("/notes"), [])).map(toNote);
});

/** Shared study notes: teachers upload, students download, the principal oversees. */
export function useNotes() {
  return noteStore.useValue();
}

export function addNote(n: Omit<StudyNote, "id" | "uploadDate" | "downloads">): StudyNote {
  const id = tempId();
  const created: StudyNote = { ...n, id, uploadDate: today(), downloads: 0 };
  void mutate(noteStore, (list) => [created, ...list], async () => {
    const sectionId = sectionGuid(n.class);
    if (!sectionId) throw new Error(`Class ${n.class} is not set up.`);
    const res = await api.post<{ id: string }>("/notes", {
      sectionId, subjectId: requireSubject(n.subject), uploadedById: teacherGuidByName(n.uploadedBy),
      title: n.title, description: n.description || null, fileName: n.fileName || `${n.title}.pdf`, sizeBytes: bytesOf(n.fileSize),
    });
    noteStore.set((list) => list.map((x) => (x.id === id ? { ...x, id: numId("note", res.id) } : x)));
  });
  return created;
}

export function removeNote(id: number) {
  void mutate(noteStore, (list) => list.filter((n) => n.id !== id), () => api.del(`/notes/${guidOf("note", id)}`));
}

/** Counts a download and saves a small text copy of the note's details. */
export function downloadNote(note: StudyNote) {
  void mutate(noteStore, (list) => list.map((n) => (n.id === note.id ? { ...n, downloads: n.downloads + 1 } : n)), () => api.post(`/notes/${guidOf("note", note.id)}/download`, {}));
  const content = [
    `Title: ${note.title}`,
    `Subject: ${note.subject}`,
    `Class: ${note.class}`,
    `Uploaded by: ${note.uploadedBy} on ${note.uploadDate}`,
    `Description: ${note.description || "No description provided"}`,
    `File: ${note.fileName} (${note.fileSize})`,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = note.fileName.replace(/\.\w+$/, ".txt");
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
