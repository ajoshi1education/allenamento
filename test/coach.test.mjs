import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findConcepts, parseIntent, resourcesFor, weakest, findConvos } from "../js/core/coach.js";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";

const all = loadAll();
const content = buildIndex(all);
content.convos = all.convos;

const ids = q => findConcepts(q, content, 5).map(x => x.id);

test("finds concepts from everyday English and Italian names", () => {
  const a = ids("I feel I'm struggling with the subjunctive and prepositions");
  assert.ok(a.some(id => id.includes("SUBJ")), a.join());
  assert.ok(a.some(id => id.includes("PREP")), a.join());
  assert.ok(ids("if clauses").every(id => id.includes("HYP")));
  assert.ok(ids("passato remoto")[0] === "C1-PAST-03");
  assert.ok(ids("ci e ne").includes("B2-PRON-02"));
  assert.ok(ids("I mix up imperfetto and passato prossimo").includes("B2-PAST-01"));
  assert.ok(ids("idioms").some(id => id.includes("IDIOM")));
  assert.ok(ids("formal emails").some(id => id === "B2-REG-01" || id === "B2-WRIT-01"));
  assert.deepEqual(ids("banana smoothie"), []);
});

test("intents", () => {
  assert.equal(parseIntent("What should I practise next?"), "next");
  assert.equal(parseIntent("show my weakest topics"), "weak");
  assert.equal(parseIntent("a conversation about work"), "convo");
  assert.equal(parseIntent("I'm bad at the subjunctive"), "topic");
});

test("resources: lesson, games, conversations and my open mistakes", () => {
  const r = resourcesFor("B2-SUBJ-01", { content, errors: [{ conceptId: "B2-SUBJ-01", status: "open", timesWrong: 2 }], progress: [{ conceptId: "B2-SUBJ-01", seen: 10, correct: 6 }] });
  assert.equal(r.concept.id, "B2-SUBJ-01");
  assert.ok(r.games.length >= 1);
  assert.ok(r.convos.length >= 1, "at least one conversation practises the subjunctive");
  assert.equal(r.openErrors, 1);
  assert.equal(r.accuracy, 0.6);
  assert.deepEqual(weakest([{ conceptId: "B2-PREP-01", status: "open", timesWrong: 3 }, { conceptId: "B2-SUBJ-01", status: "open", timesWrong: 1 }]), ["B2-PREP-01", "B2-SUBJ-01"]);
  assert.ok(findConvos("a conversation about the doctor", content).some(cv => cv.id === "CV-03"));
});
