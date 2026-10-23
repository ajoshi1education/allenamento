import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, expand, normalize, checkWriting } from "../js/core/evaluate.js";

test("expand handles alternatives and optional words", () => {
  const out = expand("(Penso|Credo) che [lei] abbia ragione");
  assert.equal(out.length, 4);
  assert.ok(out.includes("Credo che abbia ragione"));
  assert.ok(out.includes("Penso che lei abbia ragione"));
});

test("normalize: case, curly apostrophes, punctuation, spacing", () => {
  assert.equal(normalize("  Un po’ stanco!  "), "un po' stanco");
  assert.equal(normalize("L' uomo, che dorme."), "l'uomo che dorme");
});

const cloze = { id: "x1", type: "cloze", answers: ["abbia"], focus: ["abbia"], errorType: "verb-form",
  traps: [{ match: "ha", errorType: "indicative-for-subjunctive", why: "opinion" }] };

test("cloze: correct, trap and plain wrong", () => {
  assert.equal(evaluate(cloze, "Abbia").verdict, "correct");
  const t = evaluate(cloze, "ha");
  assert.equal(t.verdict, "wrong");
  assert.equal(t.errorType, "indicative-for-subjunctive");
  assert.equal(t.note, "opinion");
  const w = evaluate(cloze, "abia");
  assert.equal(w.verdict, "wrong", "single-word focus items get no typo leniency");
  assert.equal(w.errorType, "verb-form");
  assert.equal(evaluate(cloze, "").verdict, "empty");
});

test("accent-only slip is accepted but flagged", () => {
  const item = { id: "x2", type: "cloze", answers: ["è"], focus: ["è"] };
  const r = evaluate(item, "e");
  assert.equal(r.verdict, "accent");
  assert.equal(r.correct, true);
  assert.equal(r.errorType, "accent");
  assert.equal(evaluate(item, "e'").verdict, "accent");
});

const tr = { id: "x3", type: "translate", answers: ["(Penso|Credo) che [lei] abbia ragione", "Mi (sembra|pare) che [lei] abbia ragione"],
  focus: ["abbia"], errorType: "indicative-for-subjunctive",
  traps: [{ contains: ["ha"], errorType: "indicative-for-subjunctive", why: "use abbia" }] };

test("translation accepts multiple valid formulations", () => {
  for (const s of ["Penso che abbia ragione.", "credo che lei abbia ragione", "Mi pare che abbia ragione!"])
    assert.equal(evaluate(tr, s).verdict, "correct", s);
});

test("translation: typo outside focus is forgiven, on focus is not", () => {
  assert.equal(evaluate(tr, "Penso che lei abbia ragone").verdict, "typo");
  assert.equal(evaluate(tr, "Penso che lei abia ragione").verdict, "wrong");
});

test("translation: 'contains' trap identifies the mistake inside a sentence", () => {
  const r = evaluate(tr, "Penso che lei ha ragione");
  assert.equal(r.verdict, "wrong");
  assert.equal(r.note, "use abbia");
  assert.ok(r.diff.some(d => d.op === "del" && d.t === "ha"));
  assert.ok(r.diff.some(d => d.op === "add" && d.t === "abbia"));
});

test("ok-traps are accepted as natural alternatives", () => {
  const item = { id: "x4", type: "transform", answers: ["Penso che Paolo arrivi stasera"],
    traps: [{ contains: ["arriverà"], ok: true, why: "future also fine" }] };
  const r = evaluate(item, "Penso che Paolo arriverà stasera");
  assert.equal(r.verdict, "alternative");
  assert.equal(r.correct, true);
});

test("choice items use option index and per-option explanations", () => {
  const item = { id: "x5", type: "choice", options: ["dici", "dica", "dicessi"], answer: 1, errorType: "verb-form",
    traps: [{ match: "dicessi", errorType: "tense-sequence", why: "past main verb only" }] };
  assert.equal(evaluate(item, 1).verdict, "correct");
  const r = evaluate(item, 2);
  assert.equal(r.errorType, "tense-sequence");
  assert.equal(r.note, "past main verb only");
  assert.equal(evaluate(item, 0).errorType, "verb-form");
});

test("writing checklist", () => {
  const task = { minWords: 5, rubric: [{ label: "uses subjunctive", anyOf: ["\\b(sia|abbia|possa)\\b"] }] };
  const r = checkWriting(task, "Penso che sia una buona idea davvero.");
  assert.equal(r.checks[0].ok, true);
  assert.equal(r.lengthOk, true);
});
