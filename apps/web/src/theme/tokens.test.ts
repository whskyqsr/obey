import { describe, expect, it } from "vitest";
import { ACCENTS, COLOR_ROLES, DEFAULT_SEED, accentFor, contrastRatio, schemeTokens, themeCss } from "./tokens";

describe("schemeTokens", () => {
  it("produces a hex value for every role", () => {
    const tokens = schemeTokens(DEFAULT_SEED, false);
    for (const role of COLOR_ROLES) expect(tokens[role]).toMatch(/^#[0-9a-f]{6}$/);
    expect(COLOR_ROLES).toContain("surface-container-high");
    expect(COLOR_ROLES).toContain("on-surface-variant");
  });

  it("uses paper and ink", () => {
    expect(schemeTokens(DEFAULT_SEED, false).surface).toBe("#f5f0e8");
    expect(schemeTokens(DEFAULT_SEED, false)["on-surface"]).toBe("#1f1b18");
    const dark = schemeTokens(DEFAULT_SEED, true);
    expect(contrastRatio(dark.surface, "#ffffff")).toBeGreaterThan(12);
  });

  it("keeps text roles readable for every accent, light and dark", () => {
    for (const accent of ACCENTS) {
      for (const dark of [false, true]) {
        const t = schemeTokens(accent.light, dark);
        const pairs: [string, string][] = [
          ["primary", "on-primary"],
          ["primary-container", "on-primary-container"],
          ["tertiary", "on-tertiary"],
          ["tertiary-container", "on-tertiary-container"],
          ["error", "on-error"],
          ["error-container", "on-error-container"],
          ["secondary-container", "on-secondary-container"],
          ["surface-container-highest", "on-surface-variant"],
          ["inverse-surface", "inverse-on-surface"],
        ];
        for (const [bg, fg] of pairs) {
          expect(contrastRatio(t[bg as keyof typeof t], t[fg as keyof typeof t]), `${accent.id} ${dark ? "dark" : "light"} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(t.surface, t.primary), `${accent.id} accent on paper`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.surface, t["on-surface"])).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(t.surface, t.outline), `${accent.id} outline`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("follows the accent and falls back on old seeds or bad input", () => {
    expect(schemeTokens(ACCENTS[1]!.light, false).primary).not.toBe(schemeTokens(DEFAULT_SEED, false).primary);
    expect(schemeTokens("not-a-color", false)).toEqual(schemeTokens(DEFAULT_SEED, false));
    expect(accentFor("#6750a4").id).toBe("oxblood");
    expect(accentFor("#2F4A3A").id).toBe("pine");
  });
});

describe("themeCss", () => {
  it("emits light, system-dark and forced-dark blocks", () => {
    const css = themeCss(DEFAULT_SEED);
    expect(css).toContain(":root{--md-primary:");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root[data-theme="dark"]');
  });
});
