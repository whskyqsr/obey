// Bundles the API, worker and migrate entry points into dist/ so production runs plain `node`,
// without pnpm or tsx resident in memory. Workspace packages (@obey/*) are bundled in;
// everything from npm stays in node_modules.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@obey/"));

await build({
  entryPoints: ["src/server.ts", "src/worker.ts", "src/migrate.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // Subpath imports such as firebase-admin/auth stay external too.
  external: external.flatMap((name) => [name, `${name}/*`]),
  logLevel: "info",
});
