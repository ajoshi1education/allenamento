// App shell: loads content and the database, then routes #/tab/... to the views.
import { openDb } from "./db.js";
import { createSync } from "./sync.js";
import { loadContent } from "./core/content.js";
import { createStore } from "./store.js";
import { now } from "./core/clock.js";
import * as speech from "./speech.js";
import { h, esc } from "./ui.js";
import { xpSummary } from "./core/path.js";

// Main mode is the guided path; Esplora is the free mode that opens everything else.
const TABS = [
  { id: "path", label: "Percorso", icon: "🛤️" },
  { id: "review", label: "Ripasso", icon: "🔁" },
  { id: "explore", label: "Esplora", icon: "🗺️" },
  { id: "progress", label: "Progressi", icon: "📈" }
];
const TAB_OF = { learn: "explore", play: "explore", vocab: "explore", translate: "explore", errors: "review", diagnostic: "explore", settings: "" };

const VIEWS = {
  path: () => import("./views/path.js"),
  review: () => import("./views/review.js"),
  explore: () => import("./views/explore.js"),
  learn: () => import("./views/learn.js"),
  play: () => import("./views/play.js"),
  vocab: () => import("./views/vocab.js"),
  translate: () => import("./views/translate.js"),
  errors: () => import("./views/errors.js"),
  progress: () => import("./views/progress.js"),
  diagnostic: () => import("./views/diagnostic.js"),
  settings: () => import("./views/settings.js")
};

const fetchJson = async p => { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };

async function main() {
  const root = document.getElementById("app");
  const [db, content] = await Promise.all([openDb(), loadContent(fetchJson)]);
  const store = createStore(db, content, now);
  await store.registerImports();

  // Optional sync: finish a magic-link sign-in, then sync on start, every 5 minutes and when the app is hidden.
  const sync = createSync({ db, now });
  window.__sync = sync;
  if (location.hash.includes("access_token=")) { sync.acceptRedirect(location.hash); history.replaceState(null, "", location.pathname + "#/settings"); }
  const autoSync = async () => {
    if (!sync.configured() || !sync.signedIn() || !navigator.onLine) return;
    try { const r = await sync.sync(); if (r.pulled) { await store.registerImports(); store.emit("sync"); } } catch (e) { console.warn("sync", e.message); }
  };
  autoSync();
  setInterval(autoSync, 5 * 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoSync(); });
  window.__app = { store, content, db };       // handy for debugging in the console
  speech.setSilent(await store.setting("silent", false));
  const theme = await store.setting("theme", "auto");
  if (theme !== "auto") document.documentElement.setAttribute("data-theme", theme);

  root.replaceChildren(h(`<div class="shell">
    <header class="topbar">
      <a class="brand" href="#/path"><span class="logo">A</span><span class="brand-name">Allenamento</span></a>
      <nav class="tabs">${TABS.map(t => `<a href="#/${t.id}" data-tab="${t.id}"><span class="ti">${t.icon}</span><span class="tl">${t.label}</span><span class="badge" hidden></span></a>`).join("")}</nav>
      <div class="top-actions">
        <a class="pill fire" href="#/progress" id="streakPill" title="Day streak">🔥 <b>0</b></a>
        <a class="pill gold" href="#/progress" id="xpPill" title="XP today / daily goal">⭐ <b>0</b></a>
        <button class="icon-btn" id="silentBtn" title="Silent mode: text only, no audio"></button>
        <a class="icon-btn" href="#/settings" title="Settings and backup">⚙️</a>
      </div>
    </header>
    <main id="view" tabindex="-1"></main>
  </div>`));

  const silentBtn = document.getElementById("silentBtn");
  const paintSilent = () => { silentBtn.textContent = speech.isSilent() ? "🔇" : "🔊"; silentBtn.classList.toggle("on", speech.isSilent()); };
  silentBtn.onclick = async () => { speech.setSilent(!speech.isSilent()); await store.setSetting("silent", speech.isSilent()); paintSilent(); };
  paintSilent();

  async function badges() {
    const [errs, events, goal] = await Promise.all([store.errors(), store.events(), store.setting("dailyGoal", 50)]);
    const due = errs.filter(e => (e.nextReview || 0) <= now()).length;
    const b = document.querySelector('[data-tab="review"] .badge');
    b.hidden = !due; b.textContent = due > 99 ? "99+" : due;
    const x = xpSummary(events, now(), goal);
    document.querySelector("#streakPill b").textContent = x.streak;
    document.querySelector("#xpPill b").textContent = `${x.todayXp}/${x.goal}`;
    document.querySelector("#xpPill").classList.toggle("met", x.goalMet);
  }
  store.on(() => badges());
  badges();

  let current = null;
  async function route() {
    const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
    const [tab = "path", ...rest] = path.split("/").filter(Boolean).map(decodeURIComponent);
    const query = Object.fromEntries(new URLSearchParams(qs));
    const view = document.getElementById("view");
    const navTab = TAB_OF[tab] ?? tab;
    document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === navTab));
    document.body.dataset.view = tab;
    if (current && current.destroy) current.destroy();
    const loader = VIEWS[tab] || VIEWS.path;
    view.replaceChildren(h(`<div class="loading">Caricamento…</div>`));
    try {
      const mod = await loader();
      current = await mod.render(view, { store, content, params: rest, query, silent: speech.isSilent() });
    } catch (e) {
      console.error(e);
      view.replaceChildren(h(`<div class="card error-box"><h3>Something went wrong</h3><pre>${esc(e.stack || e.message)}</pre></div>`));
    }
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/path"; else route();
}

main().catch(e => {
  console.error(e);
  document.getElementById("app").innerHTML = `<div class="card error-box"><h3>Could not start</h3><pre>${esc(e.stack || e.message)}</pre></div>`;
});
