#!/usr/bin/env node
// Fails on UI patterns DESIGN.md bans. Files on an allowlist are known drift: remove each entry when its screen is matched to the mockup.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = (dir, ext) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" || f === "build" ? [] : walk(p, ext);
    return ext.some((e) => p.endsWith(e)) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
const web = walk(join(root, "apps/web/src"), [".tsx", ".ts"]);
const android = walk(join(root, "apps/android/app/src/main"), [".kt"]);

const rules = [
  {
    name: "Boxed text field on Android (use LettersField)",
    files: android,
    test: /\b(OutlinedTextField|material3\.TextField)\b|^import androidx\.compose\.material3\.TextField$/m,
    allow: [],
  },
  {
    name: "Card on Android (use hairlines)",
    files: android,
    test: /\b(Card|ElevatedCard|OutlinedCard)\(/,
    allow: [
      "ui/stats/MonthReviewScreen.kt",
      "ui/tasks/RecurrencePicker.kt",
      "ui/location/LocationScreens.kt",
      "ui/chastity/Chastity.kt",
      "ui/today/DayExtension.kt",
      "ui/onboarding/WelcomeScreen.kt",
      "ui/kits/KitsScreen.kt",
    ],
  },
  {
    name: "Card on web (use hairlines)",
    files: web,
    test: /<Card\b/,
    allow: ["pages/Welcome.tsx", "pages/Stats.tsx", "pages/LocationPage.tsx", "pages/Kits.tsx"],
  },
  {
    name: "Raw colour on web (use theme tokens)",
    files: web,
    test: /(bg|text|border|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]|["'`]#[0-9a-fA-F]{6}\b/,
    allow: ["theme/", "components/PlaceMap.tsx", "components/SafeCall.tsx", "pages/Limits.tsx", "lib/limits.ts"],
  },
  {
    name: "Raw colour on Android (use MaterialTheme.colorScheme)",
    files: android,
    test: /\bColor\(0x/,
    allow: ["ui/theme/", "ui/SafeCall.kt", "ui/agreement/AgreementScreen.kt", "ui/limits/LimitsScreen.kt"],
  },
  {
    name: 'Capital "Submissive" in user-facing text (always lowercase)',
    files: [...web, ...android],
    test: /"[^"]*(?<![.\w])Submissive\b[^"]*"|>[^<{]*(?<![.\w])Submissive\b/,
    allow: [],
  },
  {
    name: "Explainer help text in Settings (DESIGN.md: no explainers)",
    files: web.filter((f) => /pages\/Settings\.tsx|components\/(NotificationTypes|QuietHours|AppLock)\.tsx$/.test(f)),
    test: /\bhelp="/,
    allow: [],
  },
  {
    name: 'Create button labelled "New <thing>" on Android top bar (use "New" or +)',
    files: android,
    test: /ExtendedFloatingActionButton\([^)]*text = \{ Text\("New \w+/,
    allow: [],
  },
];

let failed = 0;
for (const r of rules) {
  for (const f of r.files) {
    const rel = relative(root, f);
    if (r.allow.some((a) => rel.includes(a))) continue;
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
        if (r.test.test(line)) {
          failed++;
          console.log(`${rel}:${i + 1}  ${r.name}\n    ${line.trim().slice(0, 140)}`);
        }
      });
  }
}
// Allowlist entries that no longer match anything should be removed, so the list stays a true record of drift.
for (const r of rules)
  for (const a of r.allow) {
    const hits = r.files.filter((f) => relative(root, f).includes(a) && readFileSync(f, "utf8").split("\n").some((l) => r.test.test(l)));
    if (!hits.length) {
      failed++;
      console.log(`Allowlist entry "${a}" under "${r.name}" no longer matches: remove it from scripts/design-check.mjs.`);
    }
  }
if (failed) {
  console.log(`\n${failed} design problem(s). See DESIGN.md.`);
  process.exit(1);
}
console.log("Design check passed.");
