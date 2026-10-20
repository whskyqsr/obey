import { describe, expect, it } from "vitest";
import { COLOR_ROLES, DEFAULT_SEED, contrastRatio, schemeTokens, themeCss } from "./tokens";

describe("schemeTokens", () => {
  it("produces a hex value for every M3 role", () => {
    const tokens = schemeTokens("#6750a4", false);
    for (const role of COLOR_ROLES) expect(tokens[role]).toMatch(/^#[0-9a-f]{6}$/);
    expect(COLOR_ROLES).toContain("surface-container-high");
    expect(COLOR_ROLES).toContain("on-surface-variant");
  });

  it("makes light surfaces light and dark surfaces dark", () => {
    const light = schemeTokens("#6750a4", false);
    const dark = schemeTokens("#6750a4", true);
    expect(contrastRatio(light.surface, "#000000")).toBeGreaterThan(15);
    expect(contrastRatio(dark.surface, "#ffffff")).toBeGreaterThan(12);
    expect(light.primary).not.toBe(dark.primary);
  });

  it("keeps text roles readable on their containers", () => {
    for (const dark of [false, true]) {
      const t = schemeTokens("#b3261e", dark);
      expect(contrastRatio(t.primary, t["on-primary"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.surface, t["on-surface"])).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t["primary-container"], t["on-primary-container"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("follows the seed hue and falls back on bad input", () => {
    expect(schemeTokens("#006a6a", false).primary).not.toBe(schemeTokens("#b3261e", false).primary);
    expect(schemeTokens("not-a-color", false)).toEqual(schemeTokens(DEFAULT_SEED, false));
  });
});

describe("themeCss", () => {
  it("emits light, system-dark and forced-dark blocks", () => {
    const css = themeCss("#6750a4");
    expect(css).toContain(":root{--md-primary:");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root[data-theme="dark"]');
  });
});
