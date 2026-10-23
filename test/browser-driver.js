// Browser test helper (not loaded by the app). In the page console:
//   const d = await import("/test/browser-driver.js");  await d.drive(["item-id-to-get-wrong"]);
// Answers whatever exercises appear, correctly unless the item id is listed, and returns a log.
// Check / Continue live in the exercise, or in the session footer.
const btn = (ex, act) => ex.querySelector(`[data-act=${act}]`) || document.querySelector(`.session-footer [data-act=${act}]`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
import { expand } from "/js/core/evaluate.js";

export function answerFor(item, wrong) {
  if (item.type === "free") return wrong ? "Penso che è una buona idea." : item.model;
  if (!wrong) return expand(item.answers[0])[0];
  const trap = (item.traps || []).find(t => t.match && !t.ok);
  return trap ? [].concat(trap.match)[0] : "risposta sbagliata";
}

export async function drive(wrongIds = [], max = 40) {
  const log = [];
  for (let n = 0; n < max; n++) {
    await sleep(120);
    const ex = document.querySelector(".exercise");
    if (!ex) break;
    if (ex.classList.contains("done")) { btn(ex, "next").click(); continue; }
    let item = window.__app.content.items.get(ex.dataset.item);
    if (!item && ex.dataset.item.startsWith("vocab:")) {
      const v = (await window.__app.store.vocab()).find(x => "vocab:" + x.id === ex.dataset.item);
      item = { id: ex.dataset.item, type: "translate", answers: [v.it.replace(/[()[\]|]/g, " ")] };
    }
    if (!item && ex.dataset.item.endsWith("#build")) {
      const { toBuilder } = await import("/js/core/adaptive.js");
      item = toBuilder(window.__app.content.items.get(ex.dataset.item.replace(/#build$/, "")));
    }
    const wrong = wrongIds.includes(item.id) || wrongIds.includes("*");
    if (item.type === "choice") {
      const ok = [].concat(item.answer);
      ex.querySelectorAll(".choice")[wrong ? item.options.findIndex((_, i) => !ok.includes(i)) : ok[0]].click();
      if (!ex.classList.contains("done")) btn(ex, "check").click();
    } else if (item.type === "order") {
      const words = wrong ? [...item.tokens].reverse() : answerFor(item, false).split(" ");
      const bare = s => s.replace(/[.,!?;:]+$/, "").toLowerCase();
      for (const w of words) {
        const tok = [...ex.querySelectorAll(".order-bank .token")].find(t => t.textContent === w) || [...ex.querySelectorAll(".order-bank .token")].find(t => bare(t.textContent) === bare(w));
        if (tok) tok.click(); else console.warn("driver: no tile for", w, item.id);
      }
      btn(ex, "check").click();
    } else {
      ex.querySelector("input.gap, textarea").value = answerFor(item, wrong);
      btn(ex, "check").click();
    }
    await sleep(250);
    const scope = document.querySelector(".session-footer .feedback:not([hidden])") || ex;
    const v = scope.querySelector(".verdict");
    const chips = [...scope.querySelectorAll(".eb-chip")].map(c => c.textContent.trim());
    log.push(`${item.id} ${v ? v.textContent.trim() : "?"}${chips.length ? " | " + chips.join(" / ") : ""}`);
  }
  return log;
}

export async function resetAll() {
  localStorage.clear();
  await new Promise(r => { const q = indexedDB.deleteDatabase("allenamento"); q.onsuccess = q.onerror = q.onblocked = r; });
}

// Play a whole path session: cards (Continua) and exercises, getting the listed ids wrong.
export async function playSession(wrongIds = [], max = 60) {
  const log = [];
  for (let n = 0; n < max; n++) {
    await sleep(150);
    const ov = document.querySelector(".session-overlay"); if (!ov) break;
    const next = ov.querySelector(".session-footer [data-next]");
    if (next) { const end = ov.querySelector(".end"); if (end) log.push("END " + end.innerText.split("\n").filter(Boolean).join(" | ").slice(0, 160)); next.click(); continue; }
    if (ov.querySelector(".exercise")) log.push(...await drive(wrongIds, 1));
  }
  return log;
}
