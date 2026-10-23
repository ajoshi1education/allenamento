// Detective engine: each witness line hides a grammar task; a correct answer gives a sharp clue,
// a wrong one a blurred clue (and an Error Bank entry). Finish by naming the culprit.
import { h, esc, md, runExercise } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import * as speech from "../speech.js";

export async function play(view, ctx) {
  const { game, store } = ctx;
  const chars = game.characters || {};
  const clues = [];
  view.replaceChildren(h(`<section class="page game-page detective">
    <a class="back" href="#/play">← Games</a>
    <div class="det-layout">
      <div class="det-main">
        <h1>${esc(game.title)}</h1>
        <div class="card scene-intro it">${md(game.intro)}</div>
        <div id="stage"></div>
      </div>
      <aside class="card casebook"><h3>🗒️ Taccuino</h3><ol id="clues"><li class="muted">Nessun indizio ancora.</li></ol></aside>
    </div></section>`));
  const stage = view.querySelector("#stage"), clueList = view.querySelector("#clues");
  const paintClues = () => { clueList.innerHTML = clues.map(c => `<li class="${c.sharp ? "" : "blurred"}">${md(c.text)}</li>`).join("") || `<li class="muted">Nessun indizio ancora.</li>`; };

  await waitClick(stage, `<button class="btn primary" data-go>Inizia l'indagine →</button>`);
  let right = 0;
  for (const [i, s] of game.scenes.entries()) {
    const ch = chars[s.speaker] || { name: s.speaker };
    const sceneEl = h(`<div class="scene">
      <div class="speaker"><span class="avatar">${ch.avatar || "🕵️"}</span><div><b>${esc(ch.name)}</b>${ch.role && ch.role !== "you" ? `<span class="muted small">, ${esc(ch.role)}</span>` : ""}</div>
        <span class="muted small grow-r">Scena ${i + 1}/${game.scenes.length}</span></div>
      <blockquote class="it">${md(s.line)}</blockquote>
      <div class="scene-ex"></div></div>`);
    stage.replaceChildren(sceneEl);
    const { result } = await runExercise(sceneEl.querySelector(".scene-ex"), s.item, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent() });
    if (result.correct) right++;
    clues.push({ text: result.correct ? s.clue : s.clueBlurred, sharp: result.correct });
    paintClues();
  }

  const acc = game.accusation;
  const pick = await new Promise(res => {
    stage.replaceChildren(h(`<div class="card accusation"><h2>${esc(acc.question)}</h2>
      <p class="muted">Rileggi il taccuino. Blurred clues are the ones you answered wrongly.</p>
      <div class="choices">${acc.options.map(o => `<button class="choice" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join("")}</div></div>`));
    stage.querySelector(".choices").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) res(b.dataset.id); });
  });
  const solved = pick === acc.answer;
  const score = (right + (solved ? 1 : 0)) / (game.scenes.length + 1);
  await saveGameResult(store, game.id, score);
  stage.replaceChildren(h(`<div class="card summary">
    <div class="big-score ${solved ? "ok" : "bad"}">${solved ? "Caso risolto" : "Caso aperto"}</div>
    <p class="it">${md(solved ? acc.solved : acc.wrong)}</p>
    <p>${right}/${game.scenes.length} grammar tasks correct${right < game.scenes.length ? ". Your mistakes are in the Error Bank and will come back in different sentences" : ""}.</p>
    <div class="row-actions">
      ${right < game.scenes.length ? `<a class="btn primary" href="#/errors/quiz?concept=${esc(game.conceptIds[0])}">Retest my mistakes</a>` : ""}
      <a class="btn ghost" href="#/learn/${esc(game.conceptIds[0])}">Review the lesson</a>
      <a class="btn ghost" href="#/play">More games</a></div></div>`));
}

function waitClick(host, html) {
  return new Promise(res => { host.replaceChildren(h(`<div>${html}</div>`)); host.querySelector("[data-go]").addEventListener("click", res); host.querySelector("[data-go]").focus(); });
}
