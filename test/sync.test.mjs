// Two devices syncing through a mock of Supabase's REST API (PostgREST + auth).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync, mergeRecord } from "../js/sync.js";
import { createMemoryDb } from "../js/db.js";
import { createStore } from "../js/store.js";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { evaluate } from "../js/core/evaluate.js";

function mockSupabase() {
  const rows = new Map();          // key store/id → {store,id,data,deleted,updated_at}
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + (++tick) * 1000).toISOString();   // server clock
  const calls = [];
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    calls.push(`${opts.method || "GET"} ${u.pathname}`);
    if (opts.headers.apikey !== "anon" || !/^Bearer /.test(opts.headers.Authorization)) return new Response("no auth", { status: 401 });
    if (u.pathname === "/auth/v1/otp") return new Response("{}", { status: 200 });
    if (u.pathname === "/auth/v1/token") { calls.push("refresh"); return new Response(JSON.stringify({ access_token: "tok2", refresh_token: "ref2", expires_in: 3600 }), { status: 200 }); }
    if (u.pathname === "/rest/v1/records" && (opts.method || "GET") === "GET") {
      const since = (u.searchParams.get("updated_at") || "gt.1970").slice(3);
      const out = [...rows.values()].filter(r => r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      return new Response(JSON.stringify(out), { status: 200 });
    }
    if (u.pathname === "/rest/v1/records" && opts.method === "POST") {
      for (const r of JSON.parse(opts.body)) rows.set(r.store + "/" + r.id, { ...r, updated_at: stamp() });
      return new Response("", { status: 201 });
    }
    return new Response("not found", { status: 404 });
  }
  return { fetchImpl, rows, calls };
}

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const content = buildIndex(loadAll());

function device(server, clock) {
  const db = createMemoryDb();
  const store = createStore(db, content, clock);
  const sync = createSync({ db, fetchImpl: server.fetchImpl, storage: memStorage(), now: clock });
  sync.configure("https://proj.supabase.co", "anon", "me@example.com");
  assert.ok(sync.acceptRedirect("#access_token=tok&refresh_token=ref&expires_in=3600&token_type=bearer"));
  return { db, store, sync };
}
async function answer(store, id, resp) {
  const item = content.items.get(id);
  return store.recordAnswer({ item, response: resp, result: evaluate(item, resp), source: "test" });
}

test("errors made on the phone appear on the PC; histories from both devices merge", async () => {
  const server = mockSupabase();
  let t = new Date(2026, 9, 1, 9).getTime();
  const clock = () => t;
  const phone = device(server, clock), pc = device(server, clock);

  await answer(phone.store, "B2-SUBJ-01.e01", "ha");          // mistake on the phone
  const r1 = await phone.sync.sync();
  assert.ok(r1.pushed >= 3);                                   // error, attempt, progress, skills…
  const r2 = await pc.sync.sync();
  assert.ok(r2.pulled >= 3);
  const pcErr = await pc.store.getError("B2-SUBJ-01.e01::indicative-for-subjunctive");
  assert.equal(pcErr.userAnswer, "ha");

  // both devices touch the same error offline
  t += 864e5;
  await answer(pc.store, "B2-SUBJ-01.e01", "ha");              // PC: wrong again
  await answer(phone.store, "B2-SUBJ-01.e02", "sia");          // phone: correct on a related item
  await pc.sync.sync();
  await phone.sync.sync();
  await pc.sync.sync();
  const a = await phone.store.getError(pcErr.id), b = await pc.store.getError(pcErr.id);
  assert.equal(a.attempts.length, b.attempts.length);
  assert.ok(a.attempts.length >= 3, "attempt histories merged");
  assert.equal(a.timesWrong, 2);
  assert.equal((await phone.db.all("attempts")).length, (await pc.db.all("attempts")).length, "attempt ids don't collide across devices");
  assert.equal((await phone.db.all("attempts")).length, 3);
  assert.ok(server.calls.includes("refresh"), "expired token was refreshed");
});

test("notes and deletions propagate; nothing re-uploads when nothing changed", async () => {
  const server = mockSupabase();
  let t = new Date(2026, 9, 1, 9).getTime();
  const clock = () => t;
  const phone = device(server, clock), pc = device(server, clock);
  const out = await answer(phone.store, "B2-SUBJ-01.e04", "sanno");
  await phone.sync.sync(); await pc.sync.sync();
  t += 1000;
  await pc.store.updateError(out.captured.id, { notes: "double p!" });
  await pc.sync.sync(); await phone.sync.sync();
  assert.equal((await phone.store.getError(out.captured.id)).notes, "double p!");
  await phone.store.deleteError(out.captured.id);
  await phone.sync.sync(); await pc.sync.sync();
  assert.equal(await pc.store.getError(out.captured.id), undefined);
  const again = await pc.sync.sync();
  assert.equal(again.pushed, 0);
});

test("requests carry the anon key and the user's token", async () => {
  const server = mockSupabase();
  const d = device(server, () => Date.now());
  await d.sync.sync();
  assert.ok(server.calls.includes("GET /rest/v1/records"));
  const unconfigured = createSync({ db: createMemoryDb(), fetchImpl: server.fetchImpl, storage: memStorage() });
  await assert.rejects(() => unconfigured.sync(), /not set up/);
});

test("merge keeps the newer record for simple stores", () => {
  assert.equal(mergeRecord("vocab", { id: 1, updatedAt: 5, it: "a" }, { id: 1, updatedAt: 9, it: "b" }).it, "b");
  assert.equal(mergeRecord("vocab", { id: 1, updatedAt: 9, it: "a" }, { id: 1, updatedAt: 5, it: "b" }).it, "a");
});
