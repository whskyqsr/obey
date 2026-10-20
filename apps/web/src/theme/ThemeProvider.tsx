import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "../lib/storage";
import { DEFAULT_SEED, isHexColor, schemeTokens, themeCss } from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeState {
  seed: string;
  mode: ThemeMode;
  setSeed(seed: string): void;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const SEED_KEY = "obey.theme.seed";
const MODE_KEY = "obey.theme.mode";

function initialSeed(): string {
  const stored = storage.get(SEED_KEY);
  return stored && isHexColor(stored) ? stored : DEFAULT_SEED;
}

function initialMode(): ThemeMode {
  const stored = storage.get(MODE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [seed, setSeedState] = useState(initialSeed);
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    let style = document.getElementById("obey-theme") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "obey-theme";
      document.head.appendChild(style);
    }
    style.textContent = themeCss(seed);
  }, [seed]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);

    const meta = document.querySelector('meta[name="theme-color"]');
    const update = () => {
      const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      meta?.setAttribute("content", schemeTokens(seed, dark).surface);
    };
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [mode, seed]);

  const value = useMemo<ThemeState>(
    () => ({
      seed,
      mode,
      setSeed(next) {
        if (!isHexColor(next)) return;
        storage.set(SEED_KEY, next);
        setSeedState(next);
      },
      setMode(next) {
        storage.set(MODE_KEY, next);
        setModeState(next);
      },
    }),
    [seed, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
