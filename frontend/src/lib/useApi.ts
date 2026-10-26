import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";

/**
 * Loads one API resource for a page (pages whose data no other page shares). `reload()` fetches it again;
 * pass `null` as the path to wait (e.g. until a filter is chosen).
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(path);
  latest.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await api.get<T>(path);
      if (latest.current === path) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (latest.current === path) setError(errorMessage(e));
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Runs an API action: shows the error as a toast and resolves to the result (or undefined on failure). */
export async function act<R>(call: () => Promise<R>, success?: string | ((r: R) => string)): Promise<R | undefined> {
  try {
    const r = await call();
    if (success) toast.success(typeof success === "function" ? success(r) : success);
    return r;
  } catch (e) {
    toast.error(errorMessage(e));
    return undefined;
  }
}
