/**
 * Who is signed in, from the API: POST /auth/login (or /auth/refresh after a reload) and GET /me.
 * The portal (role) is chosen from the user's memberships; the branch from their roles
 * (organization-wide users start in the branch with the most students).
 */
import { useSyncExternalStore } from "react";
import { api, refreshSession, setAccessToken, setBranchId, hasAccessToken, onSessionExpired } from "@/api/client";
import { numId, selectOrganizationIds } from "@/api/ids";

export type Role =
  | "admin" | "principal" | "viceprincipal" | "teacher" | "student" | "parent"
  | "accountant" | "reception" | "exams" | "transport" | "warden" | "hr"
  | "librarian" | "inventory";

/** Home page and label of each portal. */
export const ROLE_ACCOUNTS: Record<Role, { label: string; path: string }> = {
  admin: { label: "Admin", path: "/admin" },
  principal: { label: "Principal", path: "/principal" },
  viceprincipal: { label: "Vice Principal", path: "/vice-principal" },
  teacher: { label: "Teacher", path: "/teacher" },
  student: { label: "Student", path: "/student" },
  parent: { label: "Parent", path: "/parent" },
  accountant: { label: "Accountant", path: "/accountant" },
  reception: { label: "Receptionist", path: "/reception" },
  exams: { label: "Exam Controller", path: "/exams" },
  transport: { label: "Transport Manager", path: "/transport" },
  warden: { label: "Hostel Warden", path: "/hostel" },
  hr: { label: "HR Manager", path: "/hr" },
  librarian: { label: "Librarian", path: "/librarian" },
  inventory: { label: "Inventory Manager", path: "/inventory" },
};

/** Database role → portal, in order of preference when a user has several roles. */
const ROLE_PORTAL: [string, Role][] = [
  ["PRINCIPAL", "principal"], ["VICE_PRINCIPAL", "viceprincipal"],
  ["GROUP_OWNER", "admin"], ["GROUP_ADMIN", "admin"], ["BRANCH_ADMIN", "admin"], ["ACADEMIC_HEAD", "admin"], ["FINANCE_HEAD", "admin"], ["HR_HEAD", "admin"], ["REGIONAL_MANAGER", "admin"],
  ["ACCOUNTANT", "accountant"], ["HR", "hr"], ["EXAM_CONTROLLER", "exams"], ["RECEPTIONIST", "reception"], ["LIBRARIAN", "librarian"],
  ["INVENTORY_MANAGER", "inventory"], ["TRANSPORT_MANAGER", "transport"], ["HOSTEL_WARDEN", "warden"],
  ["TEACHER", "teacher"], ["PARENT", "parent"], ["STUDENT", "student"],
];

export interface MeResponse {
  user: { id: string; username: string; name: string; mustChangePassword: boolean };
  organization: { id: string; name: string; subdomain: string };
  memberships: { role: { code: string; name: string }; scopeType: string; branch: { id: string } | null }[];
  organizationPermissions: string[];
  branches: { id: string; code: string; name: string; students: number; permissions: string[] }[];
  staff: { id: string; employeeCode: string; branchId: string; department: string | null; staffType: string } | null;
  students: { id: string; admissionNo: string; name: string; relation: "SELF" | "CHILD" }[];
}

export interface AuthState {
  role: Role | null;
  /** Selected child (parent) or self (student) — numeric id of the student store. */
  studentId: number;
  /** The signed-in teacher — numeric id of the teacher store. */
  teacherId: number;
  me: MeResponse | null;
  branchId: string | null;
}

let state: AuthState = { role: null, studentId: 0, teacherId: 0, me: null, branchId: null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const authStore = {
  get: () => state,
  set(patch: Partial<AuthState>) {
    state = { ...state, ...patch };
    notify();
  },
  useValue: () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state),
};

const LAST_ORG = "school-erp:last-org";
export const lastOrganization = () => {
  try {
    return localStorage.getItem(LAST_ORG) ?? "greenwood";
  } catch {
    return "greenwood";
  }
};
const branchKey = (org: string) => `school-erp:branch:${org}`;

function portalFor(me: MeResponse): Role | null {
  const codes = new Set(me.memberships.map((m) => m.role.code));
  return ROLE_PORTAL.find(([code]) => codes.has(code))?.[1] ?? null;
}

/** Applies GET /me: role, branch, teacher / student ids. */
async function loadMe(): Promise<MeResponse> {
  const me = await api.get<MeResponse>("/me");
  selectOrganizationIds(me.organization.subdomain);
  try {
    localStorage.setItem(LAST_ORG, me.organization.subdomain);
  } catch { /* ignore */ }
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(branchKey(me.organization.subdomain));
  } catch { /* ignore */ }
  const own = me.memberships.find((m) => m.branch)?.branch?.id;
  const busiest = [...me.branches].sort((a, b) => b.students - a.students)[0]?.id;
  const branchId = me.branches.find((b) => b.id === saved)?.id ?? own ?? busiest ?? null;
  setBranchId(branchId);
  const role = portalFor(me);
  authStore.set({
    me, role, branchId,
    teacherId: me.staff ? numId("staff", me.staff.id) : 0,
    studentId: me.students[0] ? numId("student", me.students[0].id) : 0,
  });
  return me;
}

/** Signs in. Returns the portal to open, or why it failed (thrown ApiError). */
export async function signIn(organization: string, username: string, password: string) {
  const res = await api.post<{ accessToken: string; user: { mustChangePassword: boolean } }>("/auth/login", { organization: organization.trim().toLowerCase(), username: username.trim(), password });
  setAccessToken(res.accessToken);
  const me = await loadMe();
  return { role: authStore.get().role, mustChangePassword: res.user.mustChangePassword, name: me.user.name };
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post<{ accessToken: string }>("/auth/change-password", { currentPassword, newPassword });
  setAccessToken(res.accessToken);
  await loadMe();
}

/** Restores the session after a reload (refresh cookie). True when signed in. */
export async function ensureSession(): Promise<boolean> {
  if (hasAccessToken() && state.me) return true;
  if (!(await refreshSession())) return false;
  try {
    await loadMe();
    return true;
  } catch {
    return false;
  }
}

export async function signOut() {
  try {
    await api.post("/auth/logout");
  } catch { /* already signed out */ }
  setAccessToken(null);
  setBranchId(null);
  authStore.set({ role: null, me: null, studentId: 0, teacherId: 0, branchId: null });
}

/** Switches the working branch (multi-branch users) and remembers it. */
export function switchBranch(id: string) {
  const me = state.me;
  if (!me?.branches.some((b) => b.id === id)) return;
  setBranchId(id);
  try {
    localStorage.setItem(branchKey(me.organization.subdomain), id);
  } catch { /* ignore */ }
  authStore.set({ branchId: id });
}

export const currentRole = () => state.role;

/** Does the user hold `permission` in the current branch (or organization-wide)? */
export function can(permission: string) {
  const me = state.me;
  if (!me) return false;
  if (me.organizationPermissions.includes(permission)) return true;
  return !!me.branches.find((b) => b.id === state.branchId)?.permissions.includes(permission);
}

/** Students and parents read their own records; staff need the permission. */
export const isSelfService = () => state.role === "student" || state.role === "parent";
export const mayRead = (permission: string) => isSelfService() || can(permission);
/** Any of the permissions in the current branch. */
export const canAny = (...permissions: string[]) => permissions.some(can);

onSessionExpired(() => {
  // Only someone who was signed in is sent back to sign in; visitors of the public pages stay where they are.
  const wasSignedIn = !!state.role;
  authStore.set({ role: null, me: null });
  if (wasSignedIn && !location.pathname.startsWith("/login")) location.assign("/login");
});
