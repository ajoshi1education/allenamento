// Browser test helper (not loaded by the app). In the page console:
//   const d = await import("/test/browser-driver.js");  await d.drive(["item-id-to-get-wrong"]);
// Answers whatever exercises appear, correctly unless the item id is listed, and returns a log.
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function answerFor(item, wrong) {
  if (!wrong) return item.answers[0].replace(/\[[^\]]*\]\s?/g, "").replace(/\(([^|)]*)[^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  const trap = (item.traps || []).find(t => t.match && !t.ok);
  return trap ? [].concat(trap.match)[0] : "risposta sbagliata";
}

export async function drive(wrongIds = [], max = 40) {
  const log = [];
  for (let n = 0; n < max; n++) {
    await sleep(120);
    const ex = document.querySelector(".exercise");
    if (!ex) break;
    if (ex.classList.contains("done")) { ex.querySelector("[data-act=next]").click(); continue; }
    const item = window.__app.content.items.get(ex.dataset.item);
    const wrong = wrongIds.includes(item.id) || wrongIds.includes("*");
    if (item.type === "choice") {
      ex.querySelectorAll(".choice")[wrong ? item.options.findIndex((_, i) => i !== item.answer) : item.answer].click();
    } else if (item.type === "order") {
      const words = wrong ? [...item.tokens].reverse() : answerFor(item, false).split(" ");
      for (const w of words) [...ex.querySelectorAll(".order-bank .token")].find(t => t.textContent === w).click();
      ex.querySelector("[data-act=check]").click();
    } else {
      ex.querySelector("input.gap, textarea").value = answerFor(item, wrong);
      ex.querySelector("[data-act=check]").click();
    }
    await sleep(250);
    const v = ex.querySelector(".verdict");
    const chips = [...ex.querySelectorAll(".eb-chip")].map(c => c.textContent.trim());
    log.push(`${item.id} ${v ? v.textContent.trim() : "?"}${chips.length ? " | " + chips.join(" / ") : ""}`);
  }
  return log;
}

export async function resetAll() {
  localStorage.clear();
  await new Promise(r => { const q = indexedDB.deleteDatabase("allenamento"); q.onsuccess = q.onerror = q.onblocked = r; });
}
