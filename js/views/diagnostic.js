// Placement test view: intro → adaptive questions → level estimate → choose concepts to skip.
import { h, esc, runExercise, toast } from "../ui.js";
import { createDiagnostic } from "../core/diagnostic.js";
import * as speech from "../speech.js";

export async function render(view, { store, content }) {
  const done = await store.setting("diagnosticDone", false);
  const last = await store.setting("diagnosticResult", null);
  view.replaceChildren(h(`<section class="page narrow">
    <h1>Placement test</h1>
    <p class="lead">About 30 questions (10–15 minutes) across grammar, vocabulary, register and comprehension. It starts at B2 and moves up to C1 in each area if you're doing well.</p>
    <div class="card"><ul>
      <li>Take your time. There's no timer, and you can type accents with the buttons.</li>
      <li>Concepts you get right on harder items can be skipped. They'll come back for short check-ups so nothing is forgotten.</li>
      <li>Mistakes go to your Error Bank like anywhere else.</li>
      <li>It works fully in silent mode.</li></ul>
      <div class="row-actions"><button class="btn primary" data-start>${done ? "Retake the test" : "Start"}</button>
      ${done ? `<a class="btn ghost" href="#/learn">Back to Learn</a>` : `<button class="btn ghost" data-skip>Skip for now</button>`}</div></div>
    ${last ? `<div class="card"><h3>Last result: ${esc(last.overall || "–")}</h3><p class="small muted">${new Date(last.t).toLocaleDateString()} · ${last.correct}/${last.asked} correct</p></div>` : ""}
    <div id="diag"></div></section>`));
  view.querySelector("[data-skip]")?.addEventListener("click", async () => { await store.setSetting("diagnosticDone", true); location.hash = "#/learn"; });
  view.querySelector("[data-start]").addEventListener("click", () => run(view, store, content));
}

async function run(view, store, content) {
  const d = createDiagnostic(content);
  const page = view.querySelector(".page");
  page.innerHTML = `<h1>Placement test</h1><div class="session-bar"><span class="sb-title" id="dstrand"></span><span class="grow"></span><span class="sb-count" id="dcount"></span></div><div id="ex"></div>`;
  const host = page.querySelector("#ex");
  let probe, n = 0;
  while ((probe = d.next())) {
    n++;
    page.querySelector("#dcount").textContent = `Question ${n}`;
    const strand = content.curriculum?.strands.find(s => s.id === probe.strand);
    page.querySelector("#dstrand").textContent = `${strand ? strand.title : probe.strand} · ${probe.cefr}`;
    const { result } = await runExercise(host, probe.item, { store, source: "diagnostic", mode: "diagnostic", silent: speech.isSilent() });
    d.record(probe, result.correct);
  }
  const est = d.estimate();
  await store.setSetting("diagnosticResult", { ...est, t: store.clock() });
  await store.setSetting("diagnosticDone", true);
  const known = [...new Set(est.known)];
  page.innerHTML = `<h1>Your placement</h1>
    <div class="card summary"><div class="big-score ok">${esc(est.overall || "B2")}</div><p>${est.correct}/${est.asked} correct overall.</p></div>
    <div class="card"><h3>By skill</h3><div class="skill-bars">${Object.entries(est.skills).map(([k, s]) => `<div class="pbar"><span class="pl">${esc(k)}</span><span class="pt"><span style="width:${Math.round(100 * ((s.b2 ?? 0) * 0.6 + (s.c1 ?? 0) * 0.4))}%"></span></span><span class="pn">${esc(s.level || "–")}</span></div>`).join("")}</div></div>
    <div class="card"><h3>Skip what you already know</h3>
      <p class="small muted">You answered these correctly on harder items. Ticked concepts are marked as known and skipped, with a short check-up in 30 days.</p>
      ${known.length ? `<ul class="skip-list">${known.map(id => `<li><label class="toggle"><input type="checkbox" value="${esc(id)}" checked> ${esc(content.concepts.get(id)?.title || id)} <span class="cid">${esc(id)}</span></label></li>`).join("")}</ul>` : `<p>Nothing to skip yet. Starting from the top is a good plan.</p>`}
      <div class="row-actions"><button class="btn primary" data-save>Save and go to Learn</button></div></div>`;
  page.querySelector("[data-save]").addEventListener("click", async () => {
    const ids = [...page.querySelectorAll(".skip-list input:checked")].map(i => i.value);
    for (const id of ids) await store.setKnown(id, "known", 30);
    toast(ids.length ? `${ids.length} concept${ids.length > 1 ? "s" : ""} marked as known` : "Saved");
    location.hash = "#/learn";
  });
}
