// Mic button behaviour shared by exercises, games, the Coach and Convos:
//   tap 🎤 → start listening; speak at your own pace (pauses don't end it)
//   tap ⏹ → stop and send what you said
// start() must begin a listening cycle (speech.listen with hold: true) and handle its result.
// The caller marks the button with class "on" while it is listening (this also covers listening
// that starts automatically); the icon follows that class.
import * as speech from "./speech.js";

export function bindMic(btn, start) {
  const icon = btn.textContent.trim() || "🎤";
  const label = btn.getAttribute("aria-label") || "Rispondi a voce";
  const paint = () => {
    const on = btn.classList.contains("on");
    btn.textContent = on ? "⏹" : icon;
    btn.setAttribute("aria-label", on ? "Ho finito: invia" : label);
    btn.title = on ? "Tocca quando hai finito di parlare" : "Tocca per parlare, poi tocca ⏹ quando hai finito";
  };
  new MutationObserver(paint).observe(btn, { attributes: true, attributeFilter: ["class"] });
  paint();
  btn.addEventListener("click", e => {
    e.preventDefault();
    if (btn.classList.contains("on") || speech.isListening()) speech.releaseListening();
    else start();
  });
}

// The listen() options every tap-to-stop mic uses.
export const TAP_TO_STOP = { hold: true, maxMs: 300000 };
