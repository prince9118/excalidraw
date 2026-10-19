import type { ReactNode } from "react";

import {
  setThemePreference,
  useTheme,
  type ThemePreference,
} from "../services/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <MonitorIcon /> },
];

// Three-way segmented control, used in menus.
export function ThemeSwitcher() {
  const { preference } = useTheme();

  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={preference === option.value}
          className={preference === option.value ? "active" : ""}
          onClick={() => setThemePreference(option.value)}
          title={option.label}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

// Single icon button that flips between light and dark.
export function ThemeToggleButton({ className = "icon-button" }: { className?: string }) {
  const { resolved } = useTheme();

  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      className={className}
      onClick={() => setThemePreference(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
