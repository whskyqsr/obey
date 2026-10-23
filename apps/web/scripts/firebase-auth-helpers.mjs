// Copies Firebase's sign-in helper pages into dist/__/auth, so Google sign-in can run on our own domain
// (VITE_FIREBASE_AUTH_DOMAIN=app.fealty.me) instead of showing <project>.firebaseapp.com.
// See "Option 4" in https://firebase.google.com/docs/auth/web/redirect-best-practices.
import { mkdir, writeFile } from "node:fs/promises";

const project = process.env.VITE_FIREBASE_PROJECT_ID;
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN ?? "";
if (!project) process.exit(0);
// Only a self-hosted auth domain depends on these files; otherwise a failed download shouldn't break the build.
const required = authDomain !== "" && !authDomain.endsWith(".firebaseapp.com") && !authDomain.endsWith(".web.app");

const source = `https://${project}.firebaseapp.com`;
// Served without the extension, as Firebase does; sirv finds the .html file.
const files = {
  "__/auth/handler": "__/auth/handler.html",
  "__/auth/handler.js": "__/auth/handler.js",
  "__/auth/experiments.js": "__/auth/experiments.js",
  "__/auth/iframe": "__/auth/iframe.html",
  "__/auth/iframe.js": "__/auth/iframe.js",
};
// Only exists when the project has Firebase Hosting; the helpers work without it.
const optional = { "__/firebase/init.json": "__/firebase/init.json" };

// A build machine's network can drop a request now and then; try each file a few times before giving up.
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url);
    } catch (e) {
      if (attempt === 4) throw e;
      console.warn(`${url}: ${e.message}, trying again`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

try {
  await mkdir("dist/__/auth", { recursive: true });
  await mkdir("dist/__/firebase", { recursive: true });
  for (const [path, out] of Object.entries({ ...files, ...optional })) {
    const res = await get(`${source}/${path}`);
    console.log(`${source}/${path}: HTTP ${res.status}`);
    if (!res.ok) {
      if (path in optional) continue;
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    await writeFile(`dist/${out}`, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`Copied Firebase auth helpers from ${source}`);
} catch (e) {
  console[required ? "error" : "warn"](`Couldn't copy Firebase auth helpers: ${e.message}`);
  if (required) process.exit(1);
}
