// Play / Test tab: game library and game launcher.
import { h, esc } from "../ui.js";

export const ENGINES = {
  detective: { label: "Caso giallo", icon: "🕵️", load: () => import("../games/detective.js") },
  dialogue: { label: "Conversazione", icon: "💬", load: () => import("../games/dialogue.js") },
  gauntlet: { label: "Sfida di grammatica", icon: "⏱️", load: () => import("../games/gauntlet.js") },
  builder: { label: "Costruisci la frase", icon: "🧩", load: () => import("../games/gauntlet.js") },
  duel: { label: "Duello di traduzione", icon: "⚔️", load: () => import("../games/gauntlet.js") },
  reading: { label: "Lettura", icon: "📰", load: () => import("../games/reading.js") },
  listening: { label: "Ascolto", icon: "🎧", load: () => import("../games/reading.js") },
  debate: { label: "Dibattito e scrittura", icon: "🖋️", load: () => import("../games/debate.js") },
  dictation: { label: "Dettato", icon: "✍️", load: () => import("../games/dictation.js") },
  blitz: { label: "Occhio all’errore!", icon: "👀", load: () => import("../games/blitz.js") },
  exam: { label: "Esame simulato", icon: "📝", load: () => import("../games/exam.js") }
};

export async function render(view, ctx) {
  const { content, store, params, query } = ctx;
  if (params[0]) {
    const game = content.games.get(params[0]);
    if (!game) { view.replaceChildren(h(`<div class="card">Gioco sconosciuto. <a href="#/play">Indietro</a></div>`)); return; }
    const eng = ENGINES[game.type];
    const mod = await eng.load();
    return mod.play(view, { ...ctx, game });
  }
  const results = new Map((await store.db.all("games")).map(g => [g.id, g]));
  const filter = query.concept || "";
  const games = [...content.games.values()].filter(g => (!filter || (g.conceptIds || []).includes(filter)) && (!query.type || g.type === query.type));
  const types = [...new Set(games.map(g => g.type))];
  view.replaceChildren(h(`<section class="page">
    <div class="page-head"><div><h1>Giochi e test</h1><p class="muted">Ogni gioco mette alla prova gli argomenti delle lezioni, e ogni errore finisce nella Banca degli errori. Tutti i giochi si possono fare in modalità muta, solo testo.</p></div>
      <div class="head-actions"><a class="btn primary" href="#/errors/quiz">Sfida personalizzata</a></div></div>
    ${filter ? `<p class="notice card">Giochi per <b>${esc(filter)}</b>. <a href="#/play">Mostra tutti</a></p>` : ""}
    ${types.map(t => `<h2>${ENGINES[t]?.icon || ""} ${esc(ENGINES[t]?.label || t)}</h2>
      <div class="game-grid">${games.filter(g => g.type === t).map(g => {
        const r = results.get(g.id);
        return `<a class="game card" href="#/play/${esc(g.id)}">
          <div class="g-icon">${ENGINES[g.type]?.icon || "🎲"}</div>
          <div class="g-body"><h3>${esc(g.title)}</h3><p class="small muted">${esc(g.subtitle || "")}</p>
          <div class="c-meta">${(g.conceptIds || []).map(c => `<span class="cid">${esc(c)}</span>`).join("")}${g.minutes ? `<span>~${g.minutes} min</span>` : ""}
          ${r ? `<span class="ok-t">Record ${Math.round(r.best * 100)}% · giocato ${r.plays}×</span>` : ""}</div></div></a>`;
      }).join("")}</div>`).join("")}
  </section>`));
}

// Shared by all engines: save a game result.
export async function saveGameResult(store, gameId, score) {
  const r = (await store.db.get("games", gameId)) || { id: gameId, plays: 0, best: 0, history: [] };
  r.plays += 1; r.best = Math.max(r.best, score); r.last = store.clock();
  r.history = [...r.history, { t: store.clock(), score }].slice(-20);
  await store.db.put("games", r);
  // Finishing a game completes its step on the path and earns XP.
  const { xp } = await store.completeNode(`game:${gameId}`, { kind: "game", correct: Math.round(score * 10), total: 10, passed: true });
  setTimeout(() => {
    const row = document.querySelector(".summary .row-actions");
    if (row && !row.querySelector("[data-back-path]")) {
      row.insertAdjacentHTML("afterbegin", `<a class="btn3d primary" data-back-path href="#/path">Continua il percorso</a>`);
      row.insertAdjacentHTML("beforebegin", `<p class="xp-earned">⭐ +${xp} XP</p>`);
    }
  }, 0);
  store.emit("game");
  return r;
}
