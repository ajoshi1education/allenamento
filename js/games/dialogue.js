// Branching conversation: characters talk, you reply by typing (graded item) or by picking a reply
// (graded choice: register, tone, grammar). Wrong or unsuitable replies can change where the story goes.
import { h, esc, md, runExercise } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import { choiceNodeItem } from "../core/content.js";
import * as speech from "../speech.js";

export async function play(view, ctx) {
  const { game, store, content } = ctx;
  const chars = game.characters || {};
  const nodes = new Map(game.nodes.map(n => [n.id, n]));
  view.replaceChildren(h(`<section class="page narrow game-page dialogue">
    <a class="back" href="#/play">← Games</a>
    <h1>${esc(game.title)}</h1>
    ${game.setting ? `<div class="card scene-intro it">${md(game.setting)}</div>` : ""}
    <div class="chat" id="chat"></div>
    <div id="reply"></div></section>`));
  const chat = view.querySelector("#chat"), reply = view.querySelector("#reply");
  const bubble = (who, text, mine = false, cls = "") => {
    const ch = chars[who] || { name: who };
    chat.append(h(`<div class="bubble-row ${mine ? "mine" : ""}">${mine ? "" : `<span class="avatar">${ch.avatar || "🙂"}</span>`}
      <div class="bubble ${cls}">${mine ? "" : `<b class="who">${esc(ch.name)}</b>`}<span class="it">${md(text)}</span></div></div>`));
    chat.lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  let node = nodes.get(game.start), graded = 0, right = 0, steps = 0;
  while (node && steps++ < 60) {
    if (node.line) bubble(node.speaker, node.line);
    if (node.line && speech.canSpeak()) speech.say(node.line.replace(/_{3,}/g, "…"));
    if (node.end) break;

    if (node.item || node.choices) {
      const item = node.item ? content.items.get(node.item.id) || node.item : (content.items.get(node.id) || choiceNodeItem(game, node));
      const { result, response } = await runExercise(reply, item, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent() });
      graded++; if (result.correct) right++;
      if (node.choices) {
        const c = node.choices[response] || node.choices[0];
        bubble("you", c.text, true, c.ok ? "" : "off");
        reply.replaceChildren();
        node = nodes.get(c.next);
      } else {
        const said = item.type === "cloze" ? item.prompt.replace(/_{3,}/, `<u>${esc(String(response || "…"))}</u>`) : esc(String(response || "…"));
        bubble("you", said, true, result.correct ? "" : "off");
        reply.replaceChildren();
        node = nodes.get(!result.correct && node.nextFail ? node.nextFail : node.next);
      }
    } else {
      // narration node: tap to continue
      await new Promise(res => {
        reply.replaceChildren(h(`<div class="row-actions"><button class="btn primary" data-go>Continua →</button></div>`));
        const b = reply.querySelector("[data-go]"); b.focus(); b.onclick = res;
      });
      reply.replaceChildren();
      node = nodes.get(node.next);
    }
  }
  const score = graded ? right / graded : 1;
  await saveGameResult(store, game.id, score);
  reply.replaceChildren(h(`<div class="card summary">
    <div class="big-score ${score >= 0.8 ? "ok" : score >= 0.5 ? "warn" : "bad"}">${right}/${graded}</div>
    ${node && node.outcome ? `<p>${md(node.outcome)}</p>` : ""}
    <p class="small muted">Different replies lead to different endings. Play again to explore them.</p>
    <div class="row-actions">
      <a class="btn primary" href="#/play/${esc(game.id)}" onclick="location.reload()">Play again</a>
      ${right < graded ? `<a class="btn" href="#/errors/quiz?concept=${esc(game.conceptIds[0])}">Retest my mistakes</a>` : ""}
      <a class="btn ghost" href="#/play">More games</a></div></div>`));
}
