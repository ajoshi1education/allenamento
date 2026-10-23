// Temporary screen: replaced later in the build.
import { h } from "../ui.js";
export async function render(view, { store }) {
  view.replaceChildren(h(`<section class="page"><h1>diagnostic</h1><div class="card empty">Coming in a later build step.</div><button class="btn primary" id="skip">Skip placement for now</button></section>`));
  view.querySelector("#skip")?.addEventListener("click", async () => { await store.setSetting("diagnosticDone", true); location.hash = "#/learn"; });
}
