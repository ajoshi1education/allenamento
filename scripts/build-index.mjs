// Regenerates content/index.json from the files in content/units, content/games and content/vocab.
// Run after adding content files: node scripts/build-index.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = path.join(ROOT, "content");
const list = dir => fs.existsSync(path.join(C, dir))
  ? fs.readdirSync(path.join(C, dir)).filter(f => f.endsWith(".json")).sort().map(f => `${dir}/${f}`)
  : [];

export function buildIndexFile() {
  const index = { curriculum: "curriculum.json", units: list("units"), games: list("games"), vocab: list("vocab") };
  fs.writeFileSync(path.join(C, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const i = buildIndexFile();
  console.log(`index.json: ${i.units.length} units, ${i.games.length} games, ${i.vocab.length} vocab files`);
}
