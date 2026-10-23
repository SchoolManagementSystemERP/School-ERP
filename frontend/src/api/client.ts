/**
 * Talks to the School ERP API (backend/, proxied at /api by Vite).
 * The access token lives only in memory; the refresh token is an http-only cookie, so a page
 * reload signs back in with POST /auth/refresh. Requests carry the selected branch in X-Branch-Id.
 */

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const BASE = "/api/v1";
let accessToken: string | null = null;
let branchId: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const hasAccessToken = () => accessToken !== null;
export const setBranchId = (id: string | null) => { branchId = id; };
export const getBranchId = () => branchId;
/** Called when the session cannot be renewed (e.g. the account was disabled). */
export const onSessionExpired = (fn: () => void) => { onSignedOut = fn; };

type Options = { headers?: Record<string, string> };

async function send(method: string, path: string, body: unknown, retry: boolean, opts: Options = {}): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (branchId) headers["x-branch-id"] = branchId;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check that the backend is running and try again.");
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return send(method, path, body, false, opts);
    onSignedOut?.();
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Gets a new access token from the refresh cookie. One request at a time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const data = (await send("POST", "/auth/refresh", undefined, false)) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export const api = {
  get: <T>(path: string) => send("GET", path, undefined, true) as Promise<T>,
  post: <T>(path: string, body?: unknown, opts?: Options) => send("POST", path, body ?? {}, true, opts) as Promise<T>,
  put: <T>(path: string, body?: unknown) => send("PUT", path, body ?? {}, true) as Promise<T>,
  patch: <T>(path: string, body?: unknown) => send("PATCH", path, body ?? {}, true) as Promise<T>,
  del: <T>(path: string) => send("DELETE", path, undefined, true) as Promise<T>,
};

/** A message for the user, e.g. in a toast. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = Array.isArray(e.details) ? (e.details as { message?: string; path?: string }[]).map((d) => `${d.path ? `${d.path}: ` : ""}${d.message}`).join("; ") : "";
    return details ? `${e.message} ${details}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
