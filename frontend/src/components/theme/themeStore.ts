export type AppTheme = "light" | "dark" | "sepia" | "midnight" | "forest";

const STORAGE_KEY = "app_theme";

export function getStoredTheme(): AppTheme {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return "light";

  const value = raw as AppTheme;
  if (value === "light" || value === "dark" || value === "sepia" || value === "midnight" || value === "forest") {
    return value;
  }
  return "light";
}

export function setStoredTheme(theme: AppTheme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function applyThemeToDocument(theme: AppTheme) {
  const root = document.documentElement;

  // remove previously applied theme classes
  root.classList.remove("dark", "theme-sepia", "theme-midnight", "theme-forest");

  if (theme === "dark") {
    root.classList.add("dark");
    return;
  }

  if (theme === "sepia") {
    root.classList.add("theme-sepia");
    return;
  }

  if (theme === "midnight") {
    root.classList.add("theme-midnight");
    return;
  }

  if (theme === "forest") {
    root.classList.add("theme-forest");
    return;
  }

  // light: nothing to add (uses :root)
}

