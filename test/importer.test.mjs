import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectAndParse, dedupe, guessLang, itemsFromImport, detectGrammar, parsePasted, parseDelimited } from "../js/core/importer.js";
import { evaluate } from "../js/core/evaluate.js";

const fx = f => fs.readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8");

test("CSV parser handles quotes, embedded commas and escaped quotes", () => {
  const r = parseDelimited('a,"b, c","say ""hi"""\n');
  assert.deepEqual(r, [["a", "b, c", 'say "hi"']]);
});

test("Saved-translations sheet export: both directions, skips other languages, dedupes", () => {
  const { format, rows } = detectAndParse(fx("gt-saved.csv"), "Saved translations.csv");
  assert.equal(format, "gt-saved");
  assert.ok(!rows.some(r => /bonjour/.test(r.it + r.en)), "English→French skipped");
  const hope = rows.find(r => r.en === "I hope you can come");
  assert.equal(hope.it, "Spero che tu possa venire");
  assert.equal(hope.direction, "en→it");
  const ce = rows.find(r => r.it === "ce la faccio");
  assert.equal(ce.en, "I can make it");
  assert.equal(ce.direction, "it→en");
  assert.ok(rows.some(r => r.it === 'Ha detto "sì"'));
  assert.ok(rows.some(r => r.it === "non vedo l'ora"), "'Detect language' rows are guessed");
  const { rows: uniq, dupes } = dedupe(rows);
  assert.equal(dupes, 1);
  assert.equal(uniq.length, rows.length - 1);
  assert.equal(dedupe(rows, new Set(uniq.map(r => r.id))).rows.length, 0, "re-import adds nothing");
});

test("Takeout My Activity JSON: only Translate records, text from title or URL", () => {
  const { format, rows } = detectAndParse(fx("takeout-translate.json"), "MyActivity.json");
  assert.equal(format, "takeout-json");
  assert.equal(rows.length, 3);
  assert.ok(rows.some(r => r.it === "mi dispiace che tu stia male"));
  assert.ok(rows.some(r => r.it === "ne vale la pena"));
  const en = rows.find(r => r.en === "to take note of" || r.it === "to take note of");
  assert.ok(en, "English-only lookups are kept");
});

test("Takeout HTML cards", () => {
  const html = `<html><div class="outer-cell"><p class="header">Translate</p><div class="content-cell">Translated <a href="https://translate.google.com/?sl=it&amp;tl=en&amp;text=mi%20manchi">mi manchi</a><br>1 Sep 2026</div></div>
   <div class="outer-cell"><p class="header">Search</p><div>Searched for weather</div></div></html>`;
  const { format, rows } = detectAndParse(html, "MyActivity.html");
  assert.equal(format, "takeout-html");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].it, "mi manchi");
});

test("pasted lines with various separators", () => {
  const rows = parsePasted("prendere atto di\tto acknowledge\nto make it = farcela\nnon vedo l'ora — I can't wait\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[1].it, "farcela");
  assert.equal(rows[2].en, "I can't wait");
});

test("language guess", () => {
  assert.equal(guessLang("Penso che sia una buona idea"), "it");
  assert.equal(guessLang("I think that is a good idea"), "en");
});

test("grammar detection links phrases to concepts", () => {
  assert.equal(detectGrammar("Spero che tu possa venire")[0].conceptId, "B2-SUBJ-01");
  assert.ok(detectGrammar("Glielo dirò domani").some(g => g.conceptId === "B2-PRON-01"));
  assert.ok(detectGrammar("Se ne va sempre presto").some(g => g.conceptId === "C1-PRON-03"));
});

test("exercises generated from an imported phrase are self-consistent", () => {
  const pool = [
    { id: "imp-1", it: "Spero che tu possa venire", en: "I hope you can come" },
    { id: "imp-2", it: "il conto, per favore", en: "the bill please" },
    { id: "imp-3", it: "ce la faccio", en: "I can make it" },
    { id: "imp-4", it: "non vedo l'ora", en: "I can't wait" }
  ];
  const items = itemsFromImport(pool[0], pool);
  assert.deepEqual(items.map(i => i.type).sort(), ["choice", "cloze", "translate"]);
  assert.ok(items.every(i => i.conceptId === "B2-SUBJ-01"));
  const cz = items.find(i => i.type === "cloze");
  assert.equal(cz.prompt, "Spero che tu ___ venire");
  assert.equal(evaluate(cz, "possa").verdict, "correct");
  assert.equal(evaluate(items.find(i => i.type === "translate"), "Spero che tu possa venire.").verdict, "correct");
  const mc = items.find(i => i.type === "choice");
  assert.equal(mc.options[mc.answer], "I hope you can come");
  assert.equal(itemsFromImport(pool[1], pool)[0].conceptId, "MY-PHRASES");
});

test("'ce la faccio' is a pronominal verb, not combined pronouns", () => {
  const g = detectGrammar("ce la faccio").map(x => x.conceptId);
  assert.ok(g.includes("C1-PRON-03"));
  assert.ok(!g.includes("B2-PRON-01"));
});
