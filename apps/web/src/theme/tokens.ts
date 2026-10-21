import { type DynamicColor, type DynamicScheme, Hct, MaterialDynamicColors, SchemeTonalSpot, TonalPalette, argbFromHex, hexFromArgb } from "@material/material-color-utilities";

export const DEFAULT_SEED = "#8c3a2b";

/** Seed presets offered in Settings. */
export const SEED_PRESETS = ["#8c3a2b", "#8b3a62", "#6750a4", "#7d5260", "#006a6a", "#386a20", "#00639b", "#8c4f00"];

/** M3 color roles we expose as `--md-<role>` CSS variables, in kebab-case. */
const ROLES = {
  primary: MaterialDynamicColors.primary,
  "on-primary": MaterialDynamicColors.onPrimary,
  "primary-container": MaterialDynamicColors.primaryContainer,
  "on-primary-container": MaterialDynamicColors.onPrimaryContainer,
  secondary: MaterialDynamicColors.secondary,
  "on-secondary": MaterialDynamicColors.onSecondary,
  "secondary-container": MaterialDynamicColors.secondaryContainer,
  "on-secondary-container": MaterialDynamicColors.onSecondaryContainer,
  tertiary: MaterialDynamicColors.tertiary,
  "on-tertiary": MaterialDynamicColors.onTertiary,
  "tertiary-container": MaterialDynamicColors.tertiaryContainer,
  "on-tertiary-container": MaterialDynamicColors.onTertiaryContainer,
  error: MaterialDynamicColors.error,
  "on-error": MaterialDynamicColors.onError,
  "error-container": MaterialDynamicColors.errorContainer,
  "on-error-container": MaterialDynamicColors.onErrorContainer,
  background: MaterialDynamicColors.background,
  "on-background": MaterialDynamicColors.onBackground,
  surface: MaterialDynamicColors.surface,
  "surface-dim": MaterialDynamicColors.surfaceDim,
  "surface-bright": MaterialDynamicColors.surfaceBright,
  "surface-container-lowest": MaterialDynamicColors.surfaceContainerLowest,
  "surface-container-low": MaterialDynamicColors.surfaceContainerLow,
  "surface-container": MaterialDynamicColors.surfaceContainer,
  "surface-container-high": MaterialDynamicColors.surfaceContainerHigh,
  "surface-container-highest": MaterialDynamicColors.surfaceContainerHighest,
  "on-surface": MaterialDynamicColors.onSurface,
  "surface-variant": MaterialDynamicColors.surfaceVariant,
  "on-surface-variant": MaterialDynamicColors.onSurfaceVariant,
  "inverse-surface": MaterialDynamicColors.inverseSurface,
  "inverse-on-surface": MaterialDynamicColors.inverseOnSurface,
  "inverse-primary": MaterialDynamicColors.inversePrimary,
  outline: MaterialDynamicColors.outline,
  "outline-variant": MaterialDynamicColors.outlineVariant,
  scrim: MaterialDynamicColors.scrim,
  shadow: MaterialDynamicColors.shadow,
} satisfies Record<string, DynamicColor>;

export type ColorRole = keyof typeof ROLES;
export const COLOR_ROLES = Object.keys(ROLES) as ColorRole[];
export type ColorTokens = Record<ColorRole, string>;

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Builds the M3 tonal-spot scheme for a seed color and returns every role as a hex string. */
export function schemeTokens(seedHex: string, dark: boolean, contrast = 0): ColorTokens {
  const seed = isHexColor(seedHex) ? seedHex : DEFAULT_SEED;
  const scheme: DynamicScheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, contrast);
  const out = {} as ColorTokens;
  for (const role of COLOR_ROLES) out[role] = hexFromArgb(ROLES[role].getArgb(scheme));
  return out;
}

/**
 * Hue turns from the seed for each person's plans on the calendar, chosen to sit well clear of primary (tasks) and
 * tertiary (plans for both). Index 0 is the first person, usually the Dominant.
 */
export const PLAN_HUE_TURNS = [150, 270, 210, 330];

/** `plan-<n>` (a dot), `plan-<n>-container` and `on-plan-<n>-container`, as M3 tonal roles in the seed's chroma. */
export function planTokens(seedHex: string, dark: boolean): Record<string, string> {
  const seed = Hct.fromInt(argbFromHex(isHexColor(seedHex) ? seedHex : DEFAULT_SEED));
  const out: Record<string, string> = {};
  PLAN_HUE_TURNS.forEach((turn, i) => {
    const p = TonalPalette.fromHueAndChroma((seed.hue + turn) % 360, 36);
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
