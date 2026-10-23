import { useLocation } from "react-router";

/**
 * The current portal's root, e.g. "/principal" or "/vice-principal".
 * Shared pages build links from it so they work in every portal that reuses them.
 */
export function useSectionBase(): string {
  const { pathname } = useLocation();
  return `/${pathname.split("/")[1] ?? ""}`;
}
