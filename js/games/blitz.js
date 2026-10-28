// Occhio all'errore! A 60-second blitz: is this sentence correct Italian? Tap ✓ / ✗ (or swipe, or ← →).
// 3 lives, a combo multiplier, +2 seconds for every mistake you catch. Errors you miss go to the Error Bank.
import { h, esc, md } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import { blitzCards, blitzDeck, multiplier } from "../core/blitz.js";
import { weakConcepts } from "../core/adaptive.js";
import { evaluate } from "../core/evaluate.js";

const GAME_MS = 60000, LIVES = 3, CATCH_BONUS_MS = 2000;
let reviewed = null;
async function loadReviewed() {
  if (!reviewed) reviewed = fetch("content/blitz-reviewed.json").then(r => (r.ok ? r.json() : { keep: {} })).then(j => j.keep || {}).catch(() => ({}));
  return reviewed;
}

export async function play(view, ctx) {
  const { game, store, content } = ctx;
  const keep = await loadReviewed();
  const cards = blitzCards(content, game.conceptIds || [], keep);
  const bestKey = "blitzBest:" + game.id;
  const best = await store.setting(bestKey, 0);
  view.replaceChildren(h(`<section class="page narrow blitz-page">
    <a class="back" href="#/play">← Giochi</a>
    <div class="card3d blitz-intro c-pink">
      <div class="blitz-logo">👀</div>
      <h1>${esc(game.title)}</h1>
      <p class="muted">${esc(game.subtitle || "")}</p>
      <div class="blitz-rules">
        <div><b>60</b><span>secondi</span></div><div><b>❤️❤️❤️</b><span>vite</span></div><div><b>×4</b><span>combo</span></div>
      </div>
      <p class="small">Is the sentence correct Italian? Tap <b class="ok-t">✓ Giusta</b> or <b class="bad-t">✗ Sbagliata</b>, swipe the card, or use the ← → keys. Every mistake you catch gives you <b>+2 seconds</b>.</p>
      ${best ? `<p class="blitz-best">🏆 Record: <b>${best}</b></p>` : ""}
      ${cards.length < 10 ? `<p class="bad-t small">Not enough sentences for this game yet.</p>` : `<button class="btn3d primary big" data-go>Via!</button>`}
    </div></section>`));
  const go = view.querySelector("[data-go]");
  if (!go) return;
  await new Promise(res => (go.onclick = res));
  const deck = blitzDeck(cards, { n: 80, weak: weakConcepts(await store.errors()) });
  const res = await runBlitz(view, deck);
  // results: missed errors go to the Error Bank
  for (const m of res.missed) {
    const result = { ...evaluate(m.item, m.response), note: "", correct: false, verdict: "wrong", errorType: m.errorType, why: m.why };
    await store.recordAnswer({ item: m.item, response: m.response, result, source: "game:" + game.id, mode: "game" });
  }
  const record = res.score > best;
  if (record) await store.setSetting(bestKey, res.score);
  await saveGameResult(store, game.id, res.answered ? res.right / res.answered : 0);
  endScreen(view, game, res, Math.max(best, res.score), record);
}

function runBlitz(view, deck) {
  return new Promise(resolve => {
    view.replaceChildren(h(`<section class="page narrow blitz-page playing">
      <div class="blitz-hud">
        <span class="blitz-lives" aria-label="Vite"></span>
        <span class="blitz-combo" hidden></span>
        <span class="blitz-score">0</span>
      </div>
      <div class="blitz-timer"><i></i></div>
      <div class="blitz-stage"><div class="blitz-card it" tabindex="-1"></div><div class="blitz-float"></div><div class="blitz-fix" hidden></div></div>
      <div class="blitz-buttons">
        <button class="blitz-btn no" data-ans="wrong" aria-label="Sbagliata">✗<small>Sbagliata</small></button>
        <button class="blitz-btn yes" data-ans="right" aria-label="Giusta">✓<small>Giusta</small></button>
      </div>
      <button class="linkish small blitz-quit">Esci</button>
    </section>`));
    const $ = s => view.querySelector(s);
    const card = $(".blitz-card"), timerBar = $(".blitz-timer i"), fixBox = $(".blitz-fix"), floatEl = $(".blitz-float");
    let i = 0, lives = LIVES, score = 0, streak = 0, bestStreak = 0, right = 0, answered = 0, caught = 0;
    let left = GAME_MS, last = performance.now(), paused = false, over = false, busy = false, raf = 0;
    const missed = [], falseAlarms = [];

    const paintHud = () => {
      $(".blitz-lives").textContent = "❤️".repeat(lives) + "🤍".repeat(LIVES - lives);
      $(".blitz-score").textContent = score;
      const m = multiplier(streak), combo = $(".blitz-combo");
      combo.hidden = m < 2; combo.textContent = `🔥 ×${m}`;
    };
    const show = () => {
      if (i >= deck.length) return finish();
      card.className = "blitz-card it enter";
      card.textContent = deck[i].text;
      card.style.transform = "";
      void card.offsetWidth; card.classList.remove("enter");
    };
    const tick = now => {
      if (over) return;
      if (!paused) left -= now - last;
      last = now;
      timerBar.style.width = `${Math.max(0, 100 * left / GAME_MS)}%`;
      timerBar.classList.toggle("low", left < 10000);
      if (left <= 0) return finish();
      raf = requestAnimationFrame(tick);
    };
    const flash = (text, cls) => { floatEl.textContent = text; floatEl.className = "blitz-float " + cls; void floatEl.offsetWidth; floatEl.classList.add("go"); };

    function answer(sayWrong) {
      if (over || busy || i >= deck.length) return;
      const c = deck[i], ok = sayWrong === c.wrong;
      answered++;
      busy = true;
      card.classList.add(sayWrong ? "fly-left" : "fly-right");
      if (ok) {
        right++; streak++; bestStreak = Math.max(bestStreak, streak);
        const pts = 10 * multiplier(streak);
        score += pts;
        if (c.wrong) { caught++; left = Math.min(GAME_MS, left + CATCH_BONUS_MS); flash(`+${pts}  ⏱+2`, "good"); } else flash(`+${pts}`, "good");
        paintHud();
        setTimeout(() => { busy = false; i++; show(); }, 230);
        return;
      }
      // a slip: lose a life, show the correct sentence, the clock stops while you read it
      streak = 0; lives--;
      if (c.wrong) missed.push(c); else falseAlarms.push(c);
      paintHud();
      view.querySelector(".blitz-page").classList.add("shake");
      setTimeout(() => view.querySelector(".blitz-page")?.classList.remove("shake"), 400);
      paused = true;
      fixBox.hidden = false;
      fixBox.innerHTML = c.wrong
        ? `<b class="bad-t">C'era un errore!</b><p class="it strike">${esc(c.text)}</p><p class="it ok-t">✓ ${esc(c.fix)}</p>${c.why ? `<p class="small">${md(c.why)}</p>` : ""}<button class="btn3d primary" data-next>Continua</button>`
        : `<b class="bad-t">Era giusta!</b><p class="it ok-t">✓ ${esc(c.text)}</p><p class="small">This sentence is correct Italian.</p><button class="btn3d primary" data-next>Continua</button>`;
      const next = () => {
        fixBox.hidden = true; paused = false; last = performance.now(); busy = false;
        if (lives <= 0) return finish();
        i++; show();
      };
      fixBox.querySelector("[data-next]").onclick = next;
      fixBox.querySelector("[data-next]").focus();
    }

    // swipe the card left (✗) or right (✓)
    let sx = null;
    card.addEventListener("pointerdown", e => { if (busy) return; sx = e.clientX; card.setPointerCapture?.(e.pointerId); card.classList.add("drag"); });
    card.addEventListener("pointermove", e => { if (sx == null) return; const dx = e.clientX - sx; card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; card.classList.toggle("lean-left", dx < -40); card.classList.toggle("lean-right", dx > 40); });
    const endDrag = e => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      card.classList.remove("drag", "lean-left", "lean-right");
      if (Math.abs(dx) > 80) answer(dx < 0); else card.style.transform = "";
    };
    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);
    view.querySelectorAll("[data-ans]").forEach(b => (b.onclick = () => answer(b.dataset.ans === "wrong")));
    const onKey = e => {
      if (!fixBox.hidden) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fixBox.querySelector("[data-next]")?.click(); } return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); answer(true); }
      if (e.key === "ArrowRight") { e.preventDefault(); answer(false); }
    };
    document.addEventListener("keydown", onKey);
    const onHash = () => finish(true);
    window.addEventListener("hashchange", onHash, { once: true });
    $(".blitz-quit").onclick = () => finish();

    function finish(leaving = false) {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      if (!leaving) resolve({ score, right, answered, caught, bestStreak, missed, falseAlarms, livesLeft: lives, timeLeft: Math.max(0, left) });
    }
    paintHud(); show();
    raf = requestAnimationFrame(t => { last = t; tick(t); });
  });
}

function endScreen(view, game, r, best, record) {
  const acc = r.answered ? Math.round(100 * r.right / r.answered) : 0;
  const why = r.livesLeft <= 0 ? "Vite finite!" : r.timeLeft <= 0 ? "Tempo scaduto!" : "Fine!";
  view.replaceChildren(h(`<section class="page narrow blitz-page">
    <div class="card3d blitz-end ${record ? "record" : ""}">
      ${record ? `<div class="confetti">${Array.from({ length: 28 }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</div>` : ""}
      <p class="muted">${why}</p>
      <div class="blitz-final">${r.score}</div>
      <p>${record ? "🏆 <b>Nuovo record!</b>" : `Record: <b>${best}</b>`}</p>
      <div class="end-stats">
        <div class="es green"><span>Errori scovati</span><b>${r.caught}</b></div>
        <div class="es blue"><span>Precisione</span><b>${acc}%</b></div>
        <div class="es orange"><span>Combo max</span><b>${r.bestStreak}</b></div>
      </div>
      ${r.missed.length ? `<h3>Errori che ti sono sfuggiti</h3><p class="small muted">Saved to your Error Bank: they'll come back in new sentences.</p>
        <ul class="blitz-missed">${r.missed.map(m => `<li><span class="it strike">${esc(m.text)}</span><span class="it ok-t">✓ ${esc(m.fix)}</span>${m.why ? `<small>${md(m.why)}</small>` : ""}</li>`).join("")}</ul>` : ""}
      ${r.falseAlarms.length ? `<h3>Erano giuste</h3><ul class="blitz-missed">${r.falseAlarms.map(m => `<li><span class="it ok-t">✓ ${esc(m.text)}</span></li>`).join("")}</ul>` : ""}
      <div class="row-actions"><button class="btn3d primary big" data-again>Rigioca</button><a class="btn3d ghost" href="#/play">Altri giochi</a><a class="btn3d ghost" href="#/path">Percorso</a></div>
    </div></section>`));
  view.querySelector("[data-again]").onclick = () => { location.hash = "#/play/" + game.id + "?r=" + Date.now(); };
}
