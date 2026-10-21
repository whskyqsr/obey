import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as contracts from "@obey/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const ANDROID = join(__dirname, "../../android/app/src/main/java/app/obey");

function kotlinFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? kotlinFiles(p) : p.endsWith(".kt") ? [p] : [];
  });
}

/** Every @Serializable data class and the JSON names of its properties. */
function kotlinModels() {
  const models = new Map<string, string[]>();
  for (const file of kotlinFiles(ANDROID)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/@Serializable\s*(?:@\w+(?:\([^)]*\))?\s*)*data class (\w+)\(/g)) {
      let depth = 1;
      let i = m.index! + m[0].length;
      const start = i;
      for (; i < src.length && depth > 0; i++) depth += src[i] === "(" ? 1 : src[i] === ")" ? -1 : 0;
      const params = src.slice(start, i - 1);
      const fields: string[] = [];
      for (const p of params.matchAll(/((?:@[\w.]+(?:\([^)]*\))?\s*)*)va[lr] (\w+)\s*:/g)) {
        if (/Transient/.test(p[1]!)) continue;
        const serial = /@SerialName\("([^"]+)"\)/.exec(p[1]!);
        fields.push(serial ? serial[1]! : p[2]!);
      }
      models.set(m[1]!, fields);
    }
  }
  return models;
}

const pascal = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Kotlin classes that share a contract's name but aren't that shape. */
const NOT_THE_SAME = new Set(["QuietHoursInput"]); // wraps quietHours in the settings patch

/**
 * Android's @Serializable models are matched to contracts by name (occurrence -> Occurrence or OccurrenceInput).
 * A field Android reads or sends that the contract doesn't have is a parity bug: it silently stays at its default.
 */
describe("Android models", () => {
  it("only read and send fields the API contract has", () => {
    const models = kotlinModels();
    const problems: string[] = [];
    let matched = 0;
    for (const [name, schema] of Object.entries(contracts)) {
      if (!(schema instanceof z.ZodObject)) continue;
      // curfew -> CurfewInput only when there's no curfewInput contract of its own.
      for (const kt of [pascal(name), ...(`${name}Input` in contracts ? [] : [`${pascal(name)}Input`])]) {
        const fields = models.get(kt);
        if (!fields || NOT_THE_SAME.has(kt)) continue;
        matched++;
        const keys = new Set(Object.keys(schema.shape));
        for (const f of fields) if (!keys.has(f)) problems.push(`${kt}.${f} is not in contracts' ${name}`);
      }
    }
    expect(matched).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });
});
