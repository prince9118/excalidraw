import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "themechange";

const darkScheme = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable (e.g. private mode); fall back to system.
  }

  return "system";
}

export function resolveTheme(preference = getThemePreference()) {
  if (preference !== "system") return preference;

  return darkScheme().matches ? "dark" : "light";
}

// `data-theme` overrides the OS preference in index.css.
export function applyTheme(preference = getThemePreference()) {
  const root = document.documentElement;

  if (preference === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // Still apply it for this session.
  }

  applyTheme(preference);

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Re-renders when either the saved preference or the OS theme changes.
export function useTheme() {
  const [preference, setPreference] = useState(getThemePreference);
  const [resolved, setResolved] = useState(() => resolveTheme());

  useEffect(() => {
    const update = () => {
      setPreference(getThemePreference());
      setResolved(resolveTheme());
    };

    const scheme = darkScheme();

    scheme.addEventListener("change", update);
    window.addEventListener(CHANGE_EVENT, update);

    return () => {
      scheme.removeEventListener("change", update);
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, []);

  return { preference, resolved };
}
