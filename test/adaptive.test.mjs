import { test } from "node:test";
import assert from "node:assert/strict";
import { toBuilder, nextItem, adjustLevel, weakConcepts, sentenceOf } from "../js/core/adaptive.js";
import { evaluate } from "../js/core/evaluate.js";
import { createMemoryDb } from "../js/db.js";
import { createStore } from "../js/store.js";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";

const cloze = { id: "c1", conceptId: "X", type: "cloze", prompt: "Penso che Marco ___ (avere) ragione.", answers: ["abbia"], traps: [{ match: "ha", errorType: "indicative-for-subjunctive", why: "w" }], difficulty: 2 };

test("builder turns a cloze into a word puzzle with the trap form as decoy", () => {
  assert.equal(sentenceOf(cloze), "Penso che Marco abbia ragione.");
  const b = toBuilder(cloze);
  assert.deepEqual(b.tokens.sort(), ["Marco", "Penso", "abbia", "che", "ha", "ragione"].sort());
  assert.equal(evaluate(b, "Penso che Marco abbia ragione").verdict, "correct");
  const r = evaluate(b, "Penso che Marco ha ragione");
  assert.equal(r.verdict, "wrong");
  assert.equal(r.errorType, "indicative-for-subjunctive");
});

test("difficulty adapts and weak concepts are preferred", () => {
  assert.equal(adjustLevel(2, true, 2), 3);
  assert.equal(adjustLevel(2, true, 1), 2);
  assert.equal(adjustLevel(1, false, 0), 1);
  const pool = [{ id: "a", conceptId: "A", difficulty: 2 }, { id: "b", conceptId: "B", difficulty: 2 }];
  const weak = weakConcepts([{ conceptId: "B", status: "open", timesWrong: 3 }]);
  for (let i = 0; i < 10; i++) assert.equal(nextItem(pool, { level: 2, weak }).id, "b");
  assert.equal(nextItem(pool, { level: 2, used: new Set(["a", "b"]) }), null);
});

test("free writing is checked against its rubric", () => {
  const item = { id: "w", type: "free", prompt: "Write", minWords: 8, model: "m",
    rubric: [{ label: "concessive", anyOf: ["\\b(sebbene|benché)\\b"], errorType: "connector", hint: "use sebbene" }, { label: "subjunctive", anyOf: ["\\b(sia|abbia)\\b"], errorType: "wrong-mood" }] };
  const ok = evaluate(item, "Sebbene sia difficile, penso che valga la pena provarci davvero.");
  assert.equal(ok.verdict, "correct");
  const bad = evaluate(item, "Anche se è difficile, penso che vale la pena provarci davvero.");
  assert.equal(bad.verdict, "wrong");
  assert.equal(bad.errorType, "connector");
  assert.match(bad.note, /use sebbene/);
});

test("vocabulary mistakes also create a flashcard; manual saving works", async () => {
  const content = buildIndex(loadAll());
  const store = createStore(createMemoryDb(), content, () => Date.now());
  const item = { id: "vv1", conceptId: "B2-SUBJ-01", type: "cloze", prompt: "Ho ___ (to make) una decisione.", answers: ["preso"], errorType: "collocation", en: "I made a decision." };
  await store.recordAnswer({ item, response: "fatto", result: evaluate(item, "fatto"), source: "test" });
  const cards = await store.vocab();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].it, "Ho preso una decisione.");
  assert.equal(cards[0].source, "error");
  await store.saveVocab({ it: "prendere atto di", en: "to acknowledge", source: "manual" });
  const v = await store.reviewVocab("u-prendere-atto-di", 4);
  assert.equal(v.card.reps, 1);
  assert.equal((await store.vocab()).length, 2);
});

test("errors keep a snapshot so imported items can be retested", async () => {
  const { pickRetestItem, captureMistake } = await import("../js/core/errors.js");
  const item = { id: "imp:1", conceptId: "IMPORT", type: "translate", prompt: "the bill", answers: ["il conto"] };
  const e = captureMistake(null, { item, concept: null, response: "la bolletta", result: evaluate(item, "la bolletta"), source: "import", now: 1 });
  assert.equal(pickRetestItem(e, []).prompt, "the bill");
});
