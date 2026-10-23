// Optional audio. Everything has a silent, text-only path; these are used only when available and enabled.
let silent = false;
export const setSilent = v => { silent = !!v; if (silent) stop(); };
export const isSilent = () => silent;

export const canSpeak = () => !silent && typeof speechSynthesis !== "undefined";
export const canListen = () => !silent && !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);

function italianVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /^it[-_]IT/i.test(v.lang) && /natural|google|online/i.test(v.name)) || vs.find(v => /^it/i.test(v.lang)) || null;
}

export function say(text, { rate = 0.95 } = {}) {
  if (!canSpeak()) return Promise.resolve(false);
  return new Promise(res => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, ""));
    u.lang = "it-IT";
    const v = italianVoice(); if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => res(true); u.onerror = () => res(false);
    speechSynthesis.speak(u);
  });
}
export function stop() { try { speechSynthesis.cancel(); } catch { /* none */ } }
export const hasItalianVoice = () => typeof speechSynthesis !== "undefined" && !!italianVoice();

// One-shot speech recognition in Italian. Resolves with the best transcript or null.
export function listen({ timeout = 8000 } = {}) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR || silent) return Promise.resolve(null);
  return new Promise(res => {
    const r = new SR();
    r.lang = "it-IT"; r.interimResults = false; r.maxAlternatives = 3;
    let done = false;
    const finish = v => { if (!done) { done = true; try { r.stop(); } catch { /* */ } res(v); } };
    r.onresult = e => finish(e.results[0][0].transcript);
    r.onerror = () => finish(null);
    r.onend = () => finish(null);
    setTimeout(() => finish(null), timeout);
    r.start();
  });
}
