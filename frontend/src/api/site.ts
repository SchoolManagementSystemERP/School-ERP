/**
 * Which school a public website page belongs to. In production each school's site runs on its own
 * subdomain (greenwood.schoolerp.in); locally VITE_SITE_ORG chooses it, else the last school signed in to.
 */
import { lastOrganization } from "@/store/auth";

export function siteOrganization(): string {
  const fromEnv = import.meta.env.VITE_SITE_ORG as string | undefined;
  if (fromEnv) return fromEnv.toLowerCase();
  const host = location.hostname;
  const labels = host.split(".");
  if (labels.length >= 3 && !/^\d+$/.test(labels[0]) && labels[0] !== "www") return labels[0].toLowerCase();
  return lastOrganization() || "greenwood";
}
