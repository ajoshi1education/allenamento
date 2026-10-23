// Publish the built site (dist/) to the gh-pages branch, which GitHub Pages serves.
// Usage: npm run deploy     (builds first)
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "pipe" }).toString().trim();

const remote = run("git remote get-url origin");
const dist = path.join(ROOT, "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("dist/ is missing: run the build first");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "allenamento-pages-"));
fs.cpSync(dist, tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, ".nojekyll"), "");          // serve files as-is
const name = run("git config user.name"), email = run("git config user.email");
run("git init -q -b gh-pages", tmp);
run(`git config user.name "${name}"`, tmp);
run(`git config user.email "${email}"`, tmp);
run("git add -A", tmp);
run(`git commit -q -m "Deploy ${new Date().toISOString()}"`, tmp);
run(`git push -q -f "${remote}" gh-pages`, tmp);
fs.rmSync(tmp, { recursive: true, force: true });
console.log("Published to the gh-pages branch of " + remote);
