// Progress: skills, strengths/weaknesses, recurring errors, next steps, achievements and weekly challenges.
import { h, esc, errorLabel } from "../ui.js";
import { buildReport } from "../core/progress.js";

export async function render(view, { store, content }) {
  const [attempts, errors, progress, skills, vocab, imports, gamesArr] = await Promise.all([
    store.attempts(), store.errors(), store.allProgress(), store.skills(), store.vocab(), store.imports(), store.db.all("games")]);
  const games = Object.fromEntries(gamesArr.map(g => [g.id, g]));
  const r = buildReport({ attempts, errors, progress, skills, vocab, imports, games, content }, store.clock());
  const diag = await store.setting("diagnosticResult", null);
  const pct = x => (x == null ? "–" : Math.round(x * 100) + "%");

  view.replaceChildren(h(`<section class="page progress">
    <div class="page-head"><div><h1>Progressi</h1><p class="muted">${r.totals.answers} risposte · ${r.concepts.started} argomenti iniziati · ${r.concepts.mastered} padroneggiati o già noti${diag ? ` · livello: <b>${esc(diag.overall || "–")}</b>` : ""}</p></div>
      <div class="head-actions"><a class="btn ghost" href="#/diagnostic">${diag ? "Rifai il test di livello" : "Fai il test di livello"}</a></div></div>

    <div class="grid-2">
      <div class="card"><h3>Prossimi passi</h3>
        ${r.recommendations.length ? `<ol class="recs">${r.recommendations.map(x => `<li><a href="${x.href}">${esc(x.text)}</a></li>`).join("")}</ol>` : `<p class="muted">Inizia con una lezione. I consigli compaiono man mano che ti eserciti.</p>`}</div>
      <div class="card"><h3>Questa settimana</h3>
        <div class="streak"><b>${r.streak}</b> giorni di fila 🔥 <span class="muted small">(record ${r.totals.bestStreak})</span></div>
        ${r.challenges.map(c => `<div class="challenge ${c.done ? "done" : ""}"><div class="ch-top"><span>${c.done ? "✓ " : ""}${esc(c.title)}</span><span class="small muted">${c.value}/${c.goal}</span></div><div class="bar"><span style="width:${100 * c.value / c.goal}%"></span></div></div>`).join("")}</div>
    </div>

    <div class="card"><h3>Abilità</h3>
      <div class="skill-bars">${r.skills.map(s => `<div class="pbar"><span class="pl">${esc(s.skill)}</span><span class="pt"><span style="width:${s.score == null ? 0 : Math.round(s.score * 100)}%"></span></span><span class="pn">${s.enough ? pct(s.score) : s.attempts ? `<span title="servono almeno 8 risposte">(${s.attempts})</span>` : "–"}</span></div>`).join("")}</div>
      <p class="small muted">Score = recent accuracy, weighted towards your latest answers. Shown once a skill has 8 or more answers.</p>
      <div class="sw">${r.strengths.length ? `<div><h4>Punti forti</h4>${r.strengths.map(s => `<span class="chip ok">${esc(s)}</span>`).join(" ")}</div>` : ""}
        ${r.weaknesses.length ? `<div><h4>Da migliorare</h4>${r.weaknesses.map(s => `<span class="chip bad">${esc(s)}</span>`).join(" ")}</div>` : ""}
        ${r.recurring.length ? `<div><h4>Errori ricorrenti</h4>${r.recurring.map(g => `<a class="chip warn" href="#/errors?type=${encodeURIComponent(g.key)}">${esc(errorLabel(content, g.key))} ×${g.timesWrong}</a>`).join(" ")}</div>` : ""}</div>
    </div>

    <div class="card"><h3>Medaglie <span class="muted small">${r.achievements.filter(a => a.done).length}/${r.achievements.length}</span></h3>
      <div class="ach-grid">${r.achievements.map(a => `<div class="ach ${a.done ? "done" : ""}"><span class="ach-icon">${a.done ? "★" : "☆"}</span><div><b>${esc(a.title)}</b><div class="small muted">${esc(a.desc)}</div></div></div>`).join("")}</div></div>
  </section>`));
}
