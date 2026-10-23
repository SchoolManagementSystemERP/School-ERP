/**
 * Sign-in accounts and roles, from the API (GET /users, GET /roles) — for administrators (users.manage).
 */
import { api } from "@/api/client";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteStore } from "./remote";

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  memberships: { id: string; scopeType: string; branchId: string | null; role: { id: string; code: string; name: string } }[];
}

export interface RoleInfo { id: string; code: string; name: string; level: string; isSystem: boolean; permissions: string[] }
export interface PermissionInfo { code: string; module: string; description: string }

/** Every account the administrator may manage (all pages of GET /users). */
export const userStore = remoteStore<UserAccount[]>("users", [], async () => {
  if (!canAny("users.manage")) return [];
  const all: UserAccount[] = [];
  for (let page = 1; page < 100; page++) {
    const res = await ifAllowed(api.get<{ items: UserAccount[]; pages: number }>(`/users?pageSize=100&page=${page}`), { items: [], pages: 0 });
    all.push(...res.items);
    if (page >= res.pages) break;
  }
  return all;
});
export const roleStore = remoteStore<RoleInfo[]>("roles", [], async () => (canAny("users.manage") ? ifAllowed(api.get<RoleInfo[]>("/roles"), []) : []));
export const permissionStore = remoteStore<PermissionInfo[]>("permissions", [], async () => (canAny("users.manage") ? ifAllowed(api.get<PermissionInfo[]>("/permissions"), []) : []));

export const useUsers = () => userStore.useValue();
export const useRoles = () => roleStore.useValue();
export const usePermissions = () => permissionStore.useValue();

/** Switches an account's sign-in on or off (a disabled account is signed out everywhere). */
export function setUserActive(id: string, isActive: boolean) {
  void mutate(userStore, (list) => list.map((u) => (u.id === id ? { ...u, isActive } : u)), () => api.patch(`/users/${id}`, { isActive }));
}

/** Issues a one-time temporary password; the person must change it at the next sign-in. */
export async function resetPassword(id: string): Promise<string> {
  const res = await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`, {});
  userStore.set((list) => list.map((u) => (u.id === id ? { ...u, mustChangePassword: true } : u)));
  return res.temporaryPassword;
}

/** "Teacher, Class Teacher" — the roles of an account. */
export const roleNames = (u: UserAccount) => [...new Set(u.memberships.map((m) => m.role.name))].join(", ") || "No role";
