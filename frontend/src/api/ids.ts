/**
 * The pages work with small numeric ids (student 1, 2, 3 …); the database uses GUIDs.
 * This registry gives every GUID a stable number per kind and maps it back for API calls.
 * It is kept in localStorage per organization so numbers stay the same across reloads.
 */
type Registry = Record<string, { next: number; byGuid: Record<string, number> }>;

let org = "default";
let reg: Registry = {};
let reverse: Record<string, Record<number, string>> = {};

const key = () => `school-erp:ids:${org}`;

function rebuildReverse() {
  reverse = {};
  for (const [kind, r] of Object.entries(reg)) {
    reverse[kind] = {};
    for (const [g, n] of Object.entries(r.byGuid)) reverse[kind][n] = g;
  }
}

/** Switches to an organization's registry (called after sign-in). */
export function selectOrganizationIds(subdomain: string) {
  org = subdomain;
  try {
    reg = JSON.parse(localStorage.getItem(key()) ?? "{}");
  } catch {
    reg = {};
  }
  rebuildReverse();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(key(), JSON.stringify(reg));
    } catch {
      // storage full / blocked: numbers just won't survive a reload
    }
  }, 50);
}

/** Number for a GUID (assigned on first sight). */
export function numId(kind: string, guid: string): number {
  const g = guid.toLowerCase();
  const r = (reg[kind] ??= { next: 1, byGuid: {} });
  let n = r.byGuid[g];
  if (n === undefined) {
    n = r.next++;
    r.byGuid[g] = n;
    (reverse[kind] ??= {})[n] = g;
    save();
  }
  return n;
}

/** GUID for a number; throws if the record was never loaded. */
export function guidOf(kind: string, n: number): string {
  const g = reverse[kind]?.[n];
  if (!g) throw new Error(`Unknown ${kind} #${n} — reload the page.`);
  return g;
}

export const maybeGuid = (kind: string, n: number | null | undefined) => (n == null ? undefined : reverse[kind]?.[n]);
