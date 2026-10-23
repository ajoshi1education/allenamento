import { test } from "node:test";
import assert from "node:assert/strict";
import { extractGap, matchOption, bestSpokenAnswer, wordMatch, fluency, detectErrors, assessTurn } from "../js/core/speechcheck.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { buildIndex } from "../js/core/content.js";
import { expand } from "../js/core/evaluate.js";

test("cloze by voice: the gap word is found whether you say one word or the whole sentence", () => {
  const p = "Penso che Marco ___ (avere) ragione.";
  assert.equal(extractGap(p, "abbia"), "abbia");
  assert.equal(extractGap(p, "Penso che Marco abbia ragione"), "abbia");
  assert.equal(extractGap(p, "che Marco abbia ragione"), "abbia");
  assert.equal(extractGap(p, "Marco abbia"), "abbia");
});

test("choice by voice", () => {
  const opts = ["dici", "dica", "dirai", "dicessi"];
  assert.equal(matchOption(opts, "dica"), 1);
  assert.equal(matchOption(opts, "Dicessi"), 3);
  assert.equal(matchOption(opts, "voglio che tu mi dica"), 1);
  assert.equal(matchOption(opts, "pizza margherita"), -1);
});

test("best spoken answer tries every recogniser alternative", () => {
  const item = { id: "x", type: "cloze", prompt: "Spero che tu ___ (potere) venire.", answers: ["possa"], focus: ["possa"], traps: [{ match: "puoi", errorType: "indicative-for-subjunctive" }] };
  const r = bestSpokenAnswer(item, [{ text: "spero che tu possa venire", confidence: 0.8 }]);
  assert.equal(r.result.correct, true);
  const r2 = bestSpokenAnswer(item, [{ text: "pausa" }, { text: "possa" }]);
  assert.equal(r2.result.correct, true, "a correct second alternative wins");
  const r3 = bestSpokenAnswer(item, [{ text: "spero che tu puoi venire" }]);
  assert.equal(r3.result.errorType, "indicative-for-subjunctive");
});

test("repeat-after-me word match and fluency", () => {
  const m = wordMatch("Se fossi in te, ci penserei due volte", "se fossi in te ci penserei volte");
  assert.ok(m.score > 0.8 && m.score < 1);
  assert.deepEqual(m.missed, ["due"]);
  assert.equal(fluency({ text: "ieri sono andato al mare con i miei amici", speechMs: 4000 }).wpm, 135);
  assert.equal(fluency({ text: "ieri sono andato al mare con i miei amici", speechMs: 4000 }).score, 1);
  assert.equal(fluency({ text: "sì", speechMs: 500 }).score, null);
});

test("grammar detectors catch typical spoken errors and suggest fixes", () => {
  const h = detectErrors("Penso che lui è stanco e ieri ho andato a Roma");
  assert.deepEqual(h.map(x => x.id).sort(), ["aux-avere-motion", "subj-after-opinion"]);
  assert.equal(h.find(x => x.id === "subj-after-opinion").fixed, "Penso che lui sia");
  assert.equal(h.find(x => x.id === "aux-avere-motion").fixed, "sono andato");
  assert.equal(detectErrors("Se sarei ricco, comprerei una casa")[0].id, "cond-in-if");
  assert.equal(detectErrors("Vivo in Roma da due anni")[0].fixed, "a Roma");
});

test("detectors never fire on correct Italian from the course (model answers and accepted answers)", () => {
  const content = buildIndex(loadAll());
  const offenders = [];
  for (const it of content.allItems()) {
    const texts = it.type === "free" ? [it.model || ""] : it.type === "choice" ? [] : (it.answers || []).flatMap(a => expand(a)).slice(0, 6);
    for (const t of texts) {
      const s = it.type === "cloze" ? it.prompt.replace(/_{3,}/, t).replace(/\s*\([^)]*\)/, "") : t;
      const hits = detectErrors(s);
      if (hits.length) offenders.push(`${it.id}: "${s}" → ${hits.map(h => h.id).join(",")}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("assessing a conversation turn", () => {
  const turn = { expect: { minWords: 6, rubric: [{ label: "passato prossimo", anyOf: ["\\b(sono|ho)\\s+\\w+(ato|uto|ito)\\b"] }] } };
  const good = assessTurn(turn, { text: "Sabato sono andato al mare con la mia ragazza", confidence: 0.92, speechMs: 3800 });
  assert.equal(good.task.checks[0].ok, true);
  assert.equal(good.grammar.length, 0);
  assert.ok(good.score > 0.85);
  const bad = assessTurn(turn, { text: "Sabato ho andato al mare", confidence: 0.6, speechMs: 6000 });
  assert.equal(bad.grammar[0].id, "aux-avere-motion");
  assert.ok(bad.score < good.score);
});

test("subjunctive detector: noun subjects yes, relative clauses no", () => {
  assert.equal(detectErrors("Penso che il mare è bellissimo")[0]?.fixed, "Penso che il mare sia");
  assert.equal(detectErrors("Spero che la gente che è venuta si diverta").length, 0);
  assert.equal(detectErrors("Penso che sia vero e che è tardi").filter(h => h.id === "subj-after-opinion").length, 0);
});
