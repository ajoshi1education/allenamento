import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAll, validate } from "../scripts/validate-content.mjs";

test("all content validates: ids unique, links resolve, answers and traps self-check", () => {
  const r = validate(loadAll());
  assert.deepEqual(r.errors, []);
  assert.ok(r.items > 0);
});
