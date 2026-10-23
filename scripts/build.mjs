// Netlify build: validate content, regenerate the content index, copy the site into dist/,
// and stamp the service-worker version so installed apps pick up new content.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAll, validate } from "./validate-content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");

const report = validate(loadAll());   // also rewrites content/index.json
if (report.errors.length) {
  report.errors.forEach(e => console.error("ERROR " + e));
  process.exit(1);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
for (const item of ["index.html", "manifest.webmanifest", "sw.js", "css", "js", "icons", "content"]) {
  await fs.cp(path.join(ROOT, item), path.join(OUT, item), { recursive: true, filter: src => !src.endsWith(".md") });
}

// Precache list for offline use: every file in dist except the service worker itself.
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}
const files = (await walk(OUT)).map(f => path.relative(OUT, f).split(path.sep).join("/")).filter(f => f !== "sw.js");
const version = (process.env.COMMIT_REF || "").slice(0, 8) || new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const swPath = path.join(OUT, "sw.js");
let sw = await fs.readFile(swPath, "utf8");
sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`).replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(["./", ...files])};`);
await fs.writeFile(swPath, sw);
console.log(`Built dist/: ${files.length} files, ${report.concepts} concepts, ${report.items} items, service worker ${version}.`);
