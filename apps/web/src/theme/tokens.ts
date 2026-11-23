import { Hct, TonalPalette, argbFromHex, hexFromArgb } from "@material/material-color-utilities";

/**
 * "Letters" palette: paper and ink, with one accent. The accent is the only colour the user picks, from five that
 * sit well on paper; everything else is fixed. Roles keep their M3 names (`--md-<role>`) so every component restyles
 * from here.
 */
export interface Accent {
  id: string;
  name: string;
  /** Accent on light paper. This is the stored value. */
  light: string;
  /** The same accent lifted for dark paper. */
  dark: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: "oxblood", name: "Oxblood", light: "#8f3a2d", dark: "#d27a66" },
  { id: "pine", name: "Pine", light: "#2f4a3a", dark: "#8db49a" },
  { id: "ink-blue", name: "Indigo", light: "#3b3a64", dark: "#a3a2d6" },
  { id: "leather", name: "Leather", light: "#6b4e2e", dark: "#c9a57a" },
  { id: "ink", name: "Ink", light: "#1f1b18", dark: "#e9e1d6" },
];

export const DEFAULT_SEED = ACCENTS[0]!.light;

/** Accent choices offered in Settings, as their stored values. */
export const SEED_PRESETS = ACCENTS.map((a) => a.light);

/** The accent for a stored value. Anything else, such as an old Material seed colour, falls back to oxblood. */
export function accentFor(seedHex: string): Accent {
  const hex = seedHex.toLowerCase();
  return ACCENTS.find((a) => a.light === hex) ?? ACCENTS[0]!;
}

const PAPER = {
  light: { paper: "#f5f0e8", card: "#fbf8f3", paper2: "#ece5d9", ink: "#1f1b18", ink2: "#58504a", mute: "#8a8076", line: "#e0d7ca", ok: "#4f6b4a", error: "#a3322a" },
  dark: { paper: "#17130f", card: "#1e1914", paper2: "#221d18", ink: "#f2ebe1", ink2: "#c4b9ac", mute: "#8a7f74", line: "#2f2822", ok: "#9db894", error: "#ef8e7a" },
};

const ROLE_NAMES = [
  "primary", "on-primary", "primary-container", "on-primary-container",
  "secondary", "on-secondary", "secondary-container", "on-secondary-container",
  "tertiary", "on-tertiary", "tertiary-container", "on-tertiary-container",
  "error", "on-error", "error-container", "on-error-container",
  "background", "on-background", "surface", "surface-dim", "surface-bright",
  "surface-container-lowest", "surface-container-low", "surface-container", "surface-container-high", "surface-container-highest",
  "on-surface", "surface-variant", "on-surface-variant", "inverse-surface", "inverse-on-surface", "inverse-primary",
  "outline", "outline-variant", "scrim", "shadow",
] as const;

export type ColorRole = (typeof ROLE_NAMES)[number];
export const COLOR_ROLES: ColorRole[] = [...ROLE_NAMES];
export type ColorTokens = Record<ColorRole, string>;

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Mixes `b` into `a` by `t` (0 = all a, 1 = all b). */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Every role as a hex string, for the stored accent, on light or dark paper. */
export function schemeTokens(seedHex: string, dark: boolean): ColorTokens {
  const accent = accentFor(isHexColor(seedHex) ? seedHex : DEFAULT_SEED);
  const p = dark ? PAPER.dark : PAPER.light;
  const a = dark ? accent.dark : accent.light;
  const other = dark ? accent.light : accent.dark;
  const toward = dark ? "#000000" : "#ffffff";
  return {
    primary: a,
    "on-primary": dark ? p.paper : p.card,
    "primary-container": mix(p.paper, a, dark ? 0.2 : 0.13),
    "on-primary-container": dark ? mix(a, p.ink, 0.45) : mix(a, p.ink, 0.35),
    secondary: p.ink2,
    "on-secondary": p.paper,
    "secondary-container": p.paper2,
    "on-secondary-container": p.ink,
    tertiary: p.ok,
    "on-tertiary": dark ? p.paper : p.card,
    "tertiary-container": mix(p.paper, p.ok, dark ? 0.2 : 0.14),
    "on-tertiary-container": mix(p.ok, p.ink, dark ? 0.45 : 0.4),
    error: p.error,
    "on-error": dark ? p.paper : p.card,
    "error-container": mix(p.paper, p.error, dark ? 0.2 : 0.13),
    "on-error-container": mix(p.error, p.ink, dark ? 0.45 : 0.35),
    background: p.paper,
    "on-background": p.ink,
    surface: p.paper,
    "surface-dim": dark ? mix(p.paper, "#000000", 0.25) : mix(p.paper, p.paper2, 0.6),
    "surface-bright": dark ? p.paper2 : p.card,
    "surface-container-lowest": dark ? mix(p.paper, "#000000", 0.25) : p.card,
    "surface-container-low": dark ? mix(p.paper, p.card, 0.6) : mix(p.paper, toward, 0.25),
    "surface-container": dark ? p.card : mix(p.paper, p.paper2, 0.35),
    "surface-container-high": p.paper2,
    "surface-container-highest": dark ? mix(p.paper2, p.ink, 0.06) : mix(p.paper2, p.ink, 0.04),
    "on-surface": p.ink,
    "surface-variant": p.paper2,
    "on-surface-variant": p.ink2,
    "inverse-surface": p.ink,
    "inverse-on-surface": p.paper,
    "inverse-primary": other,
    outline: p.mute,
    "outline-variant": p.line,
    scrim: "#000000",
    shadow: "#000000",
  };
}

/**
 * Hue turns from the accent for each person's plans on the calendar, chosen to sit well clear of primary (tasks) and
 * tertiary (plans for both). Index 0 is the first person, usually the Dominant.
 */
export const PLAN_HUE_TURNS = [150, 270, 210, 330];

/** `plan-<n>` (a dot), `plan-<n>-container` and `on-plan-<n>-container`, as soft tonal roles that sit on paper. */
export function planTokens(seedHex: string, dark: boolean): Record<string, string> {
  const seed = Hct.fromInt(argbFromHex(accentFor(isHexColor(seedHex) ? seedHex : DEFAULT_SEED).light));
  const out: Record<string, string> = {};
  PLAN_HUE_TURNS.forEach((turn, i) => {
    const p = TonalPalette.fromHueAndChroma((seed.hue + turn) % 360, 24);
    out[`plan-${i + 1}`] = hexFromArgb(p.tone(dark ? 80 : 40));
    out[`plan-${i + 1}-container`] = hexFromArgb(p.tone(dark ? 30 : 90));
    out[`on-plan-${i + 1}-container`] = hexFromArgb(p.tone(dark ? 90 : 10));
  });
  return out;
}

function declarations(tokens: ColorTokens, plans: Record<string, string>): string {
  return [...COLOR_ROLES.map((r) => `--md-${r}:${tokens[r]};`), ...Object.entries(plans).map(([k, v]) => `--md-${k}:${v};`)].join("");
}

/**
 * CSS text for both schemes. Light is the default, dark applies under `prefers-color-scheme: dark`
 * unless the user forced light, and `data-theme` on <html> forces either.
 */
export function themeCss(seedHex: string): string {
  const light = declarations(schemeTokens(seedHex, false), planTokens(seedHex, false));
  const dark = declarations(schemeTokens(seedHex, true), planTokens(seedHex, true));
  return [
    `:root{${light}color-scheme:light;}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}color-scheme:dark;}}`,
    `:root[data-theme="dark"]{${dark}color-scheme:dark;}`,
  ].join("\n");
}

/** WCAG relative-luminance contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
