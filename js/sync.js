// Optional sync between devices through a free Supabase project (see supabase/schema.sql).
// Local IndexedDB stays the source of truth while offline; sync() pulls remote changes, merges, then pushes local ones.
// Only the public anon key is used in the browser; row-level security keeps each user's rows private.

export const SYNC_STORES = ["events", "errors", "progress", "skills", "vocab", "imports", "games", "attempts", "settings"];
const SKIP_SETTINGS = new Set(["sync", "silent", "theme"]);   // device-specific

const keyOf = (store, r) => String(store === "progress" ? r.conceptId : store === "skills" ? r.skill : store === "settings" ? r.key : r.id);
function hash(v) { const s = JSON.stringify(v); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// Merge rules: errors combine their attempt histories; everything else keeps the newer copy.
export function mergeRecord(store, local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  if (store === "errors") {
    const seen = new Set(), attempts = [];
    for (const a of [...local.attempts, ...remote.attempts].sort((x, y) => x.t - y.t)) {
      const k = a.t + "|" + a.itemId + "|" + a.correct;
      if (!seen.has(k)) { seen.add(k); attempts.push(a); }
    }
    const newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
    return { ...newer, attempts, timesWrong: Math.max(local.timesWrong, remote.timesWrong), notes: newer.notes || local.notes || remote.notes };
  }
  const lt = local.updatedAt || local.lastSeen || local.lastT || local.last || local.t || 0;
  const rt = remote.updatedAt || remote.lastSeen || remote.lastT || remote.last || remote.t || 0;
  return rt > lt ? remote : local;
}

export function createSync({ db, fetchImpl = fetch, storage = globalThis.localStorage, now = () => Date.now() }) {
  const get = k => { try { return JSON.parse(storage.getItem("allenamento.sync." + k) || "null"); } catch { return null; } };
  const set = (k, v) => { try { storage.setItem("allenamento.sync." + k, JSON.stringify(v)); } catch { /* storage blocked */ } };
  let cfg = get("cfg"), session = get("session");

  const headers = (extra = {}) => ({ apikey: cfg.anonKey, Authorization: "Bearer " + (session ? session.access_token : cfg.anonKey), "Content-Type": "application/json", ...extra });
  async function req(path, opts = {}) {
    const r = await fetchImpl(cfg.url.replace(/\/$/, "") + path, { ...opts, headers: headers(opts.headers) });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`.slice(0, 200));
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  async function refresh() {
    if (!session || session.expires_at * 1000 > now() + 60e3) return;
    const s = await req("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
    session = { ...session, ...s, expires_at: s.expires_at || Math.floor(now() / 1000) + (s.expires_in || 3600) };
    set("session", session);
  }

  return {
    configured: () => !!(cfg && cfg.url && cfg.anonKey),
    signedIn: () => !!session,
    email: () => (session && session.user && session.user.email) || (cfg && cfg.email) || "",
    lastSync: () => get("last"),
    configure(url, anonKey, email) { cfg = { url: url.trim(), anonKey: anonKey.trim(), email: (email || "").trim() }; set("cfg", cfg); },
    async sendMagicLink(email, redirectTo) {
      cfg.email = email; set("cfg", cfg);
      await req("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, create_user: true, options: { email_redirect_to: redirectTo } }) });
    },
    // The magic link returns to the app with #access_token=…&refresh_token=… in the URL.
    acceptRedirect(hash) {
      const p = new URLSearchParams(hash.replace(/^#/, ""));
      if (!p.get("access_token")) return false;
      session = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Number(p.get("expires_at")) || Math.floor(now() / 1000) + Number(p.get("expires_in") || 3600) };
      set("session", session);
      return true;
    },
    signOut() { session = null; set("session", null); set("hashes", null); set("last", null); },

    async sync() {
      if (!this.configured() || !session) throw new Error("Sync is not set up");
      await refresh();
      const hashes = get("hashes") || {};
      const since = get("last") ? get("last").remote : "1970-01-01T00:00:00Z";
      let pulled = 0, pushed = 0, maxRemote = since;

      // 1. Pull and merge remote changes.
      const remote = await req(`/rest/v1/records?select=store,id,data,deleted,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`);
      for (const row of remote || []) {
        if (!SYNC_STORES.includes(row.store)) continue;
        if (row.updated_at > maxRemote) maxRemote = row.updated_at;
        const k = row.store + "/" + row.id;
        if (row.deleted) { await db.del(row.store, row.id); delete hashes[k]; pulled++; continue; }
        const local = await db.get(row.store, row.store === "attempts" ? Number(row.id) || row.id : row.id);
        const merged = mergeRecord(row.store, local, row.data);
        await db.put(row.store, merged);
        hashes[k] = hash(row.data) === hash(merged) ? hash(merged) : "dirty";   // dirty → our merge must go back up
        pulled++;
      }

      // 2. Push records that changed locally since the last sync, and deletions.
      const rows = [], present = new Set();
      for (const store of SYNC_STORES) {
        for (const r of await db.all(store)) {
          const id = keyOf(store, r);
          if (store === "settings" && SKIP_SETTINGS.has(id)) continue;
          const k = store + "/" + id;
          present.add(k);
          const hsh = hash(r);
          if (hashes[k] !== hsh) { rows.push({ store, id, data: r, deleted: false }); hashes[k] = hsh; }
        }
      }
      for (const k of Object.keys(hashes)) if (!present.has(k)) {
        const [store, ...rest] = k.split("/");
        rows.push({ store, id: rest.join("/"), data: {}, deleted: true });
        delete hashes[k];
      }
      for (let i = 0; i < rows.length; i += 200) {
        await req("/rest/v1/records?on_conflict=user_id,store,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
        pushed += Math.min(200, rows.length - i);
      }
      set("hashes", hashes);
      const last = { t: now(), remote: maxRemote, pulled, pushed };
      set("last", last);
      return last;
    }
  };
}
