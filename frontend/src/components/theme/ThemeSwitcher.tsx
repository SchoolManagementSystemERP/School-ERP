import { useEffect, useState } from "react";
import { Check, Coffee, Leaf, Moon, MoonStar, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppTheme } from "./themeStore";
import { applyThemeToDocument, getStoredTheme, setStoredTheme } from "./themeStore";

const THEMES: { value: AppTheme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "sepia", label: "Sepia", icon: Coffee },
  { value: "midnight", label: "Midnight", icon: MoonStar },
  { value: "forest", label: "Forest", icon: Leaf },
];

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<AppTheme>("light");

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyThemeToDocument(stored);
  }, []);

  const choose = (next: AppTheme) => {
    setTheme(next);
    setStoredTheme(next);
    applyThemeToDocument(next);
  };

  const Current = THEMES.find((t) => t.value === theme)?.icon ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Change theme">
          <Current className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onClick={() => choose(t.value)} className="gap-2">
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.value === theme && <Check className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
