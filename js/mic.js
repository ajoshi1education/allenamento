// Mic button behaviour shared by exercises, games and Convos:
//   tap          → listen, and stop by itself when you pause
//   press & hold → push-to-talk: keeps listening while held, sends when you let go
// start() must begin a listening cycle (speech.listen) and handle its result.
import * as speech from "./speech.js";

export function bindMic(btn, start, { holdAfterMs = 350 } = {}) {
  let pressed = false, holding = false, holdTimer = null;
  btn.style.touchAction = "none";
  btn.addEventListener("contextmenu", e => e.preventDefault());
  btn.addEventListener("pointerdown", e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* */ }
    pressed = true; holding = false;
    if (speech.isListening()) {
      // already listening (e.g. started automatically): pressing = hold to keep talking
      speech.holdListening(); holding = true; btn.classList.add("held");
      return;
    }
    start();
    // after a short press, switch to push-to-talk once the recogniser is ready
    const tryHold = () => {
      if (!pressed) return;
      if (speech.listeningReady()) { speech.holdListening(); holding = true; btn.classList.add("held"); }
      else holdTimer = setTimeout(tryHold, 100);
    };
    holdTimer = setTimeout(tryHold, holdAfterMs);
  });
  const up = () => {
    if (!pressed) return;
    pressed = false; clearTimeout(holdTimer); btn.classList.remove("held");
    if (holding) { holding = false; speech.releaseListening(); }
  };
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
  // keyboard: Enter/Space on the focused button = tap
  btn.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); if (speech.isListening()) speech.releaseListening(); else start(); } });
}
