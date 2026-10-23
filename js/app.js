// App shell: loads content and the database, then routes #/tab/... to the views.
import { openDb } from "./db.js";
import { loadContent } from "./core/content.js";
import { createStore } from "./store.js";
import { now } from "./core/clock.js";
import * as speech from "./speech.js";
import { h, esc } from "./ui.js";

const TABS = [
  { id: "learn", label: "Learn", icon: "📘" },
  { id: "play", label: "Play", icon: "🎲" },
  { id: "vocab", label: "Vocab", icon: "🗂️" },
  { id: "translate", label: "Translate", icon: "🔁" },
  { id: "errors", label: "Errors", icon: "🧭" },
  { id: "progress", label: "Progress", icon: "📈" }
];

const VIEWS = {
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
  window.__app = { store, content, db };       // handy for debugging in the console
  speech.setSilent(await store.setting("silent", false));
  const theme = await store.setting("theme", "auto");
  if (theme !== "auto") document.documentElement.setAttribute("data-theme", theme);

  root.replaceChildren(h(`<div class="shell">
    <header class="topbar">
      <a class="brand" href="#/learn"><span class="logo">A</span><span>Allenamento</span><span class="lvl">B2→C1</span></a>
      <nav class="tabs">${TABS.map(t => `<a href="#/${t.id}" data-tab="${t.id}"><span class="ti">${t.icon}</span><span class="tl">${t.label}</span><span class="badge" hidden></span></a>`).join("")}</nav>
      <div class="top-actions">
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
    const errs = await store.errors();
    const due = errs.filter(e => (e.nextReview || 0) <= now()).length;
    const b = document.querySelector('[data-tab="errors"] .badge');
    b.hidden = !due; b.textContent = due;
  }
  store.on(() => badges());
  badges();

  let current = null;
  async function route() {
    const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
    const [tab = "learn", ...rest] = path.split("/").filter(Boolean).map(decodeURIComponent);
    const query = Object.fromEntries(new URLSearchParams(qs));
    const view = document.getElementById("view");
    document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
    if (current && current.destroy) current.destroy();
    const loader = VIEWS[tab] || VIEWS.learn;
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
  if (!location.hash) {
    const started = await store.setting("diagnosticDone", false);
    location.hash = started ? "#/learn" : "#/diagnostic";
  } else route();
}

main().catch(e => {
  console.error(e);
  document.getElementById("app").innerHTML = `<div class="card error-box"><h3>Could not start</h3><pre>${esc(e.stack || e.message)}</pre></div>`;
});
