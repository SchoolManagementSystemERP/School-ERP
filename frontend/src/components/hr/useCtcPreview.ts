import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { CtcBreakdown } from "./hrDocs";

/** Live CTC → annexure preview (server-side rules, so it matches offers and payroll). */
export function useCtcPreview(ctc: number, basicPercent?: number) {
  const [b, setB] = useState<CtcBreakdown | null>(null);
  useEffect(() => {
    if (!(ctc >= 10000)) { setB(null); return; }
    const t = setTimeout(() => {
      api.post<CtcBreakdown>("/hr/ctc/preview", { ctcAnnual: ctc, ...(basicPercent ? { basicPercent } : {}) }).then(setB).catch(() => setB(null));
    }, 300);
    return () => clearTimeout(t);
  }, [ctc, basicPercent]);
  return b;
}
