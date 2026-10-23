/**
 * Stores backed by the API. They keep the same shape as the old browser-only stores
 * (`get`, `set`, `useValue`, `useItems`, `getAll`), so pages do not change:
 *  - data is loaded from the API before a portal opens (see `preload`) or the first time a page uses it;
 *  - changes are shown immediately and sent to the API; if the API refuses, the change is undone,
 *    the reason is shown in a toast, and the store reloads from the server.
 */
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";

export interface RemoteStore<T> {
  name: string;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  useValue: () => T;
  load: (force?: boolean) => Promise<void>;
  isLoaded: () => boolean;
  clear: () => void;
}

const registry = new Map<string, RemoteStore<unknown>>();

export function remoteStore<T>(name: string, initial: T, loader: () => Promise<T>): RemoteStore<T> {
  let value = initial;
  let loaded = false;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const store: RemoteStore<T> = {
    name,
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      notify();
    },
    useValue: () => {
      useEffect(() => {
        if (!loaded) store.load().catch((e) => toast.error(errorMessage(e)));
      }, []);
      return useSyncExternalStore(subscribe, () => value);
    },
    load(force = false) {
      if (loaded && !force) return Promise.resolve();
      pending ??= loader()
        .then((v) => {
          value = v;
          loaded = true;
          notify();
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    isLoaded: () => loaded,
    clear() {
      value = initial;
      loaded = false;
      notify();
    },
  };
  registry.set(name, store as RemoteStore<unknown>);
  return store;
}

export function remoteCollection<T extends { id: number }>(name: string, loader: () => Promise<T[]>) {
  const s = remoteStore<T[]>(name, [], loader);
  return { ...s, useItems: s.useValue, getAll: s.get };
}

/** Loads the named stores (in parallel). */
export async function preload(stores: { load: () => Promise<void> }[]) {
  await Promise.all(stores.map((s) => s.load()));
}

/** Forgets all loaded data (sign-out). */
export function clearAllStores() {
  registry.forEach((s) => s.clear());
}

/**
 * Applies a change locally right away, then calls the API. On failure the change is rolled back,
 * the error is shown, and the store reloads. Resolves to the API result (or undefined on failure).
 */
export async function mutate<T, R>(store: RemoteStore<T>, change: (prev: T) => T, call: () => Promise<R>, opts: { reload?: boolean; success?: string } = {}): Promise<R | undefined> {
  const before = store.get();
  store.set(change);
  try {
    const result = await call();
    if (opts.success) toast.success(opts.success);
    if (opts.reload) void store.load(true);
    return result;
  } catch (e) {
    store.set(before);
    toast.error(errorMessage(e));
    void store.load(true).catch(() => undefined);
    return undefined;
  }
}

/** For loaders: a 403 (the role may not see this data) means "nothing to show", not an error. */
export async function ifAllowed<T>(call: Promise<T>, fallback: T): Promise<T> {
  try {
    return await call;
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return fallback;
    throw e;
  }
}

/** Temporary ids for records not yet saved (negative, so they never clash with real ones). */
let temp = -1;
export const tempId = () => temp--;
