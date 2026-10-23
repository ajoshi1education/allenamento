// Ripasso: today's review in one tap. Due Error Bank items in new sentences, then flashcards.
import { h, esc } from "../ui.js";
import { buildQuiz, isDue, patterns } from "../core/errors.js";
import { runSession } from "../session.js";
import { errorLabel } from "../ui.js";

export async function render(view, ctx) {
  const { store, content } = ctx;
  const now = store.clock();
  const [errors, vocab] = await Promise.all([store.errors(), store.vocab()]);
  const due = errors.filter(e => isDue(e, now));
  const dueVocab = vocab.filter(v => v.card && v.card.due <= now);
  const open = errors.filter(e => e.status !== "mastered");
  const pat = patterns(errors, now);
  view.replaceChildren(h(`<section class="page narrow review-page">
    <div class="hero card3d c-blue">
      <div class="hero-icon">🔁</div>
      <div><h1>Ripasso</h1><p>I tuoi errori tornano in frasi nuove finché non rispondi giusto in 3 giorni diversi.</p></div>
    </div>
    <div class="big-actions">
      <button class="action-tile c-blue ${due.length ? "" : "dim"}" data-review>
        <span class="at-icon">🎯</span><b>${due.length ? `Riprova ${Math.min(due.length, 10)} ${due.length > 1 ? "errori" : "errore"}` : "Nessun errore da ripassare"}</b>
        <small>${due.length ? `${due.length} da ripassare ora, prima i più vecchi e ripetuti` : "Torna domani, o esercitati su tutti gli errori aperti"}</small></button>
      <a class="action-tile c-orange ${dueVocab.length ? "" : "dim"}" href="#/vocab/review${dueVocab.length ? "" : "?all=1"}">
        <span class="at-icon">🗂️</span><b>${dueVocab.length ? `${dueVocab.length} flashcard da ripassare` : "Esercitati con le flashcard"}</b>
        <small>${vocab.length} carte nel tuo mazzo</small></a>
      <button class="action-tile c-purple ${open.length ? "" : "dim"}" data-all>
        <span class="at-icon">💪</span><b>Esercitati su tutti gli errori aperti</b><small>${open.length} aperti nella Banca degli errori</small></button>
      <a class="action-tile c-green" href="#/errors"><span class="at-icon">🧭</span><b>Banca degli errori</b><small>Cerca, filtra, note, schemi ricorrenti</small></a>
    </div>
    ${pat.byType.length ? `<div class="card3d"><h3>Dove sbagli di più</h3><div class="trip-list">${pat.byType.slice(0, 4).map(g => `<a href="#/errors?type=${encodeURIComponent(g.key)}" class="trip"><b>${esc(errorLabel(content, g.key))}</b><span>${g.timesWrong}× · ${g.open} aperti</span></a>`).join("")}</div></div>` : ""}
  </section>`));
  const go = async (filter, includeAll) => {
    const plan = buildQuiz(await store.errors(), content.allItems(), store.clock(), { n: 10, filter, includeAll });
    if (!plan.length) return;
    await runSession({ title: "Ripasso", subtitle: "I tuoi errori, in frasi nuove", steps: plan.map(p => ({ type: "exercise", item: p.item, retestOf: p.error.id, tag: errorLabel(content, p.error.errorType) })) },
      { store, nodeId: null, kind: "review", accent: "blue" });
    render(view, ctx);
  };
  view.querySelector("[data-review]").onclick = () => due.length && go(e => isDue(e, store.clock()), false);
  view.querySelector("[data-all]").onclick = () => open.length && go(e => e.status !== "mastered", true);
}
