/**
 * Prints a document (letter, payslip, annexure) on its own A4 page: the HTML is written into a hidden
 * frame with print styles and the browser's print dialog opens (save as PDF from there).
 */
export function printDocument(title: string, bodyHtml: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; font-size: 12.5px; line-height: 1.55; }
    h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; }
    .head { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
    .muted { color: #555; } .right { text-align: right; } .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; } td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 700; background: #f7f7f7; }
    .sign { margin-top: 48px; display: flex; justify-content: space-between; }
    p { margin: 0 0 10px; }
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const inrText = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
