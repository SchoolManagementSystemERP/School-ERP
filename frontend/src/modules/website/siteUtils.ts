import type { Announcement } from "@/types/communication";

/** Announcements meant for everyone are shown on the public website, newest first. */
export function publicNotices(list: Announcement[]): Announcement[] {
  return list.filter((a) => a.audience.includes("everyone")).sort((a, b) => b.date.localeCompare(a.date));
}

/** "2026-10-12" → "12 Oct 2026" */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Saves generated text as a file in the visitor's browser. */
export function downloadFile(filename: string, content: string, type = "text/html") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A simple printable HTML document (used for prospectus, forms and lists). */
export function printableDoc(title: string, schoolName: string, sections: { heading: string; lines: string[] }[]): string {
  const body = sections
    .map((s) => `<h2>${escapeHtml(s.heading)}</h2><ul>${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${escapeHtml(schoolName)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6}
h1{color:#172554;border-bottom:3px solid #fbbf24;padding-bottom:8px}h2{color:#172554;margin-top:28px}li{margin:4px 0}</style>
</head><body><p style="color:#64748b">${escapeHtml(schoolName)}</p><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
