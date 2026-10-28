// Occhio all'errore!: cards are built only from the course's own answers and traps, and only
// hand-reviewed wrong sentences are used.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { evaluate } from "../js/core/evaluate.js";
import { blitzCards, blitzDeck, multiplier } from "../js/core/blitz.js";

const all = loadAll();
const content = buildIndex(all);
const ids = [...content.concepts.keys()];
const reviewedFile = new URL("../content/blitz-reviewed.json", import.meta.url);
const keep = fs.existsSync(reviewedFile) ? JSON.parse(fs.readFileSync(reviewedFile, "utf8")).keep : null;
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("right cards are the course's own answer; wrong cards use a trap the course marks wrong", () => {
  const cards = blitzCards(content, ids);
  assert.ok(cards.length > 100);
  for (const c of cards) {
    if (c.wrong) {
      assert.notEqual(c.text, c.fix, c.id);
      assert.equal(evaluate(c.item, c.response).correct, false, c.id);
    } else assert.equal(c.text, c.fix);
  }
});

test("only reviewed wrong sentences are used, and every reviewed id still exists", { skip: !keep }, () => {
  const cards = blitzCards(content, ids, keep);
  const wrong = cards.filter(c => c.wrong);
  assert.ok(wrong.length >= 100, `only ${wrong.length} reviewed wrong cards`);
  assert.ok(wrong.every(c => keep[c.id]));
  const allIds = new Set(blitzCards(content, ids).map(c => c.id));
  const stale = Object.keys(keep).filter(id => !allIds.has(id));
  assert.deepEqual(stale, [], "reviewed ids that no longer match a card (content changed?)");
  // both game decks have enough material
  for (const g of all.games.filter(g => g.type === "blitz")) assert.ok(blitzCards(content, g.conceptIds, keep).length >= 40, g.id);
});

test("a deck mixes right and wrong, one card per exercise", () => {
  const deck = blitzDeck(blitzCards(content, ids, keep), { n: 60, rand });
  assert.equal(deck.length, 60);
  assert.equal(new Set(deck.map(c => c.item.id)).size, 60);
  const w = deck.filter(c => c.wrong).length;
  assert.ok(w >= 20 && w <= 40, `${w} wrong of 60`);
});

test("combo multiplier", () => {
  assert.deepEqual([0, 2, 3, 5, 6, 9, 10, 30].map(multiplier), [1, 1, 2, 2, 3, 3, 4, 4]);
});
