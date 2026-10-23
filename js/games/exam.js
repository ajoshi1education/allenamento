// Esame simulato: a mock CEFR exam at the end of each path section. Sections (reading, listening,
// grammar, vocabulary, writing, speaking) run in one session; you get a score per section and pass/fail.
import { h, esc, md } from "../ui.js";
import { runSession } from "../session.js";
import * as speech from "../speech.js";

export const SECTION_LABEL = { reading: "Comprensione scritta", listening: "Comprensione orale", grammar: "Grammatica", vocabulary: "Lessico", writing: "Produzione scritta", speaking: "Produzione orale" };
const SECTION_ICON = { reading: "📰", listening: "🎧", grammar: "🧱", vocabulary: "📚", writing: "🖋️", speaking: "🎤" };
const MAX_PLAYS = 2;

export function examSteps(game, { silent = false } = {}) {
  const steps = [];
  const cid = (game.conceptIds || [])[0];
  for (const s of game.sections) {
    const listen = s.kind === "listening" && !silent;
    const intro = `<div class="lc-kicker">${SECTION_ICON[s.kind] || ""} ${esc(SECTION_LABEL[s.kind] || s.kind)}</div>
      <h2>${esc(s.title || SECTION_LABEL[s.kind])}</h2>${s.instructions ? `<p>${md(s.instructions)}</p>` : ""}
      ${s.kind === "reading" && s.passage ? `<div class="passage card-inset it">${s.passage.title ? `<h3>${esc(s.passage.title)}</h3>` : ""}${s.passage.it.split(/\n+/).map(p => `<p>${md(p)}</p>`).join("")}</div><p class="small muted">Il testo resterà disponibile sopra ogni domanda.</p>` : ""}
      ${s.kind === "listening" ? (listen
        ? `<div class="audio-box"><button class="btn3d primary" data-play>▶ Ascolta</button> <span class="small muted" data-left>Puoi ascoltare ${MAX_PLAYS} volte, come all'esame vero.</span></div>`
        : `<p class="small muted">Modalità silenziosa: leggi la trascrizione.</p><div class="passage card-inset it">${s.passage.it.split(/\n+/).map(p => `<p>${md(p)}</p>`).join("")}</div>`) : ""}`;
    let plays = 0;
    steps.push({
      type: "card", card: "html", html: intro,
      onShow: stage => {
        const b = stage.querySelector("[data-play]");
        if (!b) return;
        b.onclick = () => {
          if (plays >= MAX_PLAYS) return;
          plays++;
          speech.say(s.passage.it.replace(/^\s*([—-]|[A-ZÀ-Ý]{2,}:)\s*/gm, ""), { rate: 0.95 });
          stage.querySelector("[data-left]").textContent = plays >= MAX_PLAYS ? "Ascolti esauriti: ora rispondi." : `Ancora ${MAX_PLAYS - plays} ascolto.`;
          if (plays >= MAX_PLAYS) b.disabled = true;
        };
      }
    });
    for (const it of s.items) {
      const item = { conceptId: cid, ...it };
      if (s.kind === "reading" && s.passage && !item.passage) item.passage = s.passage;
      if (s.kind === "listening") { delete item.passage; if (silent && s.passage) item.passage = s.passage; }
      steps.push({ type: "exercise", item, section: s.kind });
    }
  }
  return steps;
}

export function sectionScores(results) {
  const by = new Map();
  for (const r of results) {
    if (!r.section) continue;
    const s = by.get(r.section) || { section: r.section, correct: 0, total: 0 };
    s.total++; if (r.correct) s.correct++;
    by.set(r.section, s);
  }
  return [...by.values()];
}

export async function play(view, ctx) {
  const { game, store } = ctx;
  const n = game.sections.reduce((a, s) => a + s.items.length, 0);
  const best = await store.db.get("games", game.id);
  view.replaceChildren(h(`<section class="page narrow">
    <a class="back" href="#/path">← Percorso</a>
    <div class="card3d convo-start"><div class="end-badge">📝</div><h1>${esc(game.title)}</h1><p class="muted">${esc(game.subtitle || "")}</p>
      <ul class="exam-sections">${game.sections.map(s => `<li>${SECTION_ICON[s.kind] || ""} ${esc(SECTION_LABEL[s.kind] || s.kind)} · ${s.items.length} ${s.items.length === 1 ? "domanda" : "domande"}</li>`).join("")}</ul>
      <p class="small muted">${n} domande, circa ${game.minutes || 25} minuti. Per superarlo serve il ${Math.round(game.passMark * 100)}%.${best ? ` Miglior risultato: ${Math.round(best.best * 100)}%.` : ""}</p>
      ${speech.isSilent() ? `<p class="small">Sei in modalità silenziosa: l'ascolto diventa lettura della trascrizione.</p>` : ""}
      <button class="btn3d primary big" data-go>Inizia l'esame</button></div></section>`));
  await new Promise(res => (view.querySelector("[data-go]").onclick = res));
  speech.unlock?.();
  const res = await runSession({ title: game.title, subtitle: "Esame simulato", passMark: game.passMark, steps: examSteps(game, { silent: speech.isSilent() }) },
    { store, nodeId: `exam:${game.id}`, kind: "exam", accent: "purple" });
  if (res.exited) { location.hash = "#/path"; return; }
  const score = res.total ? res.correct / res.total : 0;
  const r = (await store.db.get("games", game.id)) || { id: game.id, plays: 0, best: 0, history: [] };
  r.plays++; r.best = Math.max(r.best, score); r.last = store.clock(); r.history = [...r.history, { t: store.clock(), score }].slice(-20);
  await store.db.put("games", r);
  const secs = sectionScores(res.results);
  view.replaceChildren(h(`<section class="page narrow">
    <div class="card3d exam-result ${res.passed ? "won" : "lost"}"><div class="end-badge">${res.passed ? "🎓" : "💪"}</div>
      <h1>${res.passed ? "Esame superato!" : "Non ancora"}</h1>
      <p class="big-score ${res.passed ? "ok" : "warn"}">${Math.round(score * 100)}%</p>
      <p class="muted">${res.passed ? "Ottimo: sei pronto per la sezione successiva." : `Serve il ${Math.round(game.passMark * 100)}%. Ripassa le sezioni più deboli e riprova: gli errori sono nel Ripasso.`}</p>
      <div class="exam-bars">${secs.map(s => { const p = Math.round(100 * s.correct / s.total); return `<div class="eb-row"><span>${SECTION_ICON[s.section] || ""} ${esc(SECTION_LABEL[s.section] || s.section)}</span><div class="eb-bar"><i style="width:${p}%" class="${p >= 75 ? "ok" : p >= 50 ? "mid" : "low"}"></i></div><b>${s.correct}/${s.total}</b></div>`; }).join("")}</div>
      <div class="row-actions"><a class="btn3d primary" href="#/path">Continua il percorso</a><a class="btn3d ghost" href="#/review">Ripasso</a></div>
    </div></section>`));
}
