// Debate: an opponent states a position; you respond in writing (or speech) with the target structures.
// Without AI, answers are checked against each prompt's rubric and compared with a model answer.
import { h, esc, md, runExercise } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import * as speech from "../speech.js";

export async function play(view, ctx) {
  const { game, store, content } = ctx;
  const opp = game.opponent || { name: "Avversario", avatar: "🗣️" };
  view.replaceChildren(h(`<section class="page narrow game-page debate">
    <a class="back" href="#/play">← Giochi</a>
    <h1>${esc(game.title)}</h1>
    <div class="card"><h3 class="it">${md(game.topic || "")}</h3>
      <div class="bubble-row"><span class="avatar">${opp.avatar || "🗣️"}</span><div class="bubble"><b class="who">${esc(opp.name)}</b><span class="it">${md(game.stance || "")}</span></div></div>
      ${speech.canSpeak() ? `<button class="btn small ghost" data-say>🔊 Ascolta</button>` : ""}</div>
    <div id="ex"></div></section>`));
  view.querySelector("[data-say]")?.addEventListener("click", () => speech.say(game.stance));
  const host = view.querySelector("#ex");
  const prompts = (game.prompts || []).map(p => content.items.get(p.id) || p);
  let right = 0;
  for (const [i, p] of prompts.entries()) {
    const { result } = await runExercise(host, p, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent(), banner: `Turno ${i + 1} di ${prompts.length}` });
    if (result.correct) right++;
  }
  const score = prompts.length ? right / prompts.length : 0;
  await saveGameResult(store, game.id, score);
  host.replaceChildren(h(`<div class="card summary"><div class="big-score ${score >= 0.67 ? "ok" : "warn"}">${right}/${prompts.length}</div>
    <p>Turni in cui il tuo testo ha rispettato tutti i punti. I punti mancati sono nella Banca degli errori, come aspetti della scrittura da migliorare.</p>
    <div class="row-actions"><a class="btn ghost" href="#/play">Altri giochi</a></div></div>`));
}
