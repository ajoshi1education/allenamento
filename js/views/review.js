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
      <div><h1>Ripasso</h1><p>Your own mistakes come back in new sentences until you've got them right on 3 different days.</p></div>
    </div>
    <div class="big-actions">
      <button class="action-tile c-blue ${due.length ? "" : "dim"}" data-review>
        <span class="at-icon">🎯</span><b>${due.length ? `Retest ${Math.min(due.length, 10)} mistake${due.length > 1 ? "s" : ""}` : "No mistakes due"}</b>
        <small>${due.length ? `${due.length} due now, oldest and most repeated first` : "Come back tomorrow, or practise all open mistakes"}</small></button>
      <a class="action-tile c-orange ${dueVocab.length ? "" : "dim"}" href="#/vocab/review${dueVocab.length ? "" : "?all=1"}">
        <span class="at-icon">🗂️</span><b>${dueVocab.length ? `${dueVocab.length} flashcard${dueVocab.length > 1 ? "s" : ""} due` : "Practise flashcards"}</b>
        <small>${vocab.length} cards in your deck</small></a>
      <button class="action-tile c-purple ${open.length ? "" : "dim"}" data-all>
        <span class="at-icon">💪</span><b>Practise all open mistakes</b><small>${open.length} open in the Error Bank</small></button>
      <a class="action-tile c-green" href="#/errors"><span class="at-icon">🧭</span><b>Error Bank</b><small>Search, filter, notes, patterns</small></a>
    </div>
    ${pat.byType.length ? `<div class="card3d"><h3>What trips you up most</h3><div class="trip-list">${pat.byType.slice(0, 4).map(g => `<a href="#/errors?type=${encodeURIComponent(g.key)}" class="trip"><b>${esc(errorLabel(content, g.key))}</b><span>${g.timesWrong}× · ${g.open} open</span></a>`).join("")}</div></div>` : ""}
  </section>`));
  const go = async (filter, includeAll) => {
    const plan = buildQuiz(await store.errors(), content.allItems(), store.clock(), { n: 10, filter, includeAll });
    if (!plan.length) return;
    await runSession({ title: "Ripasso", subtitle: "Your mistakes, in new sentences", steps: plan.map(p => ({ type: "exercise", item: p.item, retestOf: p.error.id, tag: errorLabel(content, p.error.errorType) })) },
      { store, nodeId: null, kind: "review", accent: "blue" });
    render(view, ctx);
  };
  view.querySelector("[data-review]").onclick = () => due.length && go(e => isDue(e, store.clock()), false);
  view.querySelector("[data-all]").onclick = () => open.length && go(e => e.status !== "mastered", true);
}
