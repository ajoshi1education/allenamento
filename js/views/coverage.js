// Curriculum coverage: every planned concept with its lesson, exercises, games, assessment criteria
// and the learner's status, so nothing important is missed.
import { h, esc } from "../ui.js";

export async function render(view, { store, content }) {
  const progress = new Map((await store.allProgress()).map(p => [p.conceptId, p]));
  const errors = await store.errors();
  const strands = content.curriculum ? content.curriculum.strands : [];
  let planned = 0, built = 0, practised = 0, mastered = 0;
  const rows = strands.flatMap(s => s.concepts.map(pc => {
    planned++;
    const c = content.concepts.get(pc.id);
    const pool = content.poolFor(pc.id);
    const games = content.gamesByConcept.get(pc.id) || [];
    const p = progress.get(pc.id);
    if (c) built++;
    if (p && p.seen) practised++;
    if (p && ["mastered", "known", "skipped"].includes(p.status)) mastered++;
    const open = errors.filter(e => e.conceptId === pc.id && e.status !== "mastered").length;
    const types = [...new Set(pool.map(i => i.type))];
    const ok = c && c.lesson && pool.length >= 8 && games.length && (c.assessment || []).length;
    return `<tr class="${c ? "" : "muted"}">
      <td><span class="cid">${esc(pc.id)}</span></td>
      <td>${c ? `<a href="#/learn/${esc(pc.id)}">${esc(c.title)}</a>` : esc(pc.title)}</td>
      <td>${esc(s.id)}</td><td>${esc(pc.cefr)}</td>
      <td>${c && c.lesson ? "✓" : "–"}</td>
      <td>${pool.length} <span class="small muted">${esc(types.join(", "))}</span></td>
      <td>${games.length ? games.map(g => `<a href="#/play/${esc(g)}">${esc(g)}</a>`).join(" ") : "–"}</td>
      <td>${c ? (c.assessment || []).length : "–"}</td>
      <td>${p ? esc(p.status) : "new"}${open ? ` <span class="bad-t small">${open} aperti</span>` : ""}</td>
      <td>${ok ? "✓" : c ? "⚠" : "in programma"}</td></tr>`;
  }));
  view.replaceChildren(h(`<section class="page">
    <a class="back" href="#/learn">← Lezioni</a>
    <h1>Copertura del programma</h1>
    <p class="muted">Every concept has a unique id linked to its lesson, exercises, games and assessment criteria. ✓ means complete (a lesson, at least 8 exercises, a game and criteria).</p>
    <div class="stat-row">
      <div class="stat card"><b>${built}/${planned}</b><span>argomenti pronti</span></div>
      <div class="stat card"><b>${content.items.size}</b><span>esercizi</span></div>
      <div class="stat card"><b>${content.games.size}</b><span>giochi</span></div>
      <div class="stat card"><b>${practised}</b><span>argomenti esercitati</span></div>
      <div class="stat card ok"><b>${mastered}</b><span>padroneggiati o già noti</span></div>
    </div>
    <div class="card table-wrap"><table class="coverage-table"><thead><tr><th>ID</th><th>Argomento</th><th>Unità</th><th>QCER</th><th>Lezione</th><th>Esercizi</th><th>Giochi</th><th>Criteri</th><th>Tu</th><th></th></tr></thead>
    <tbody>${rows.join("")}</tbody></table></div></section>`));
}
