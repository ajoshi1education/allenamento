// Audio: text-to-speech (questions, answers, the tutor) and speech recognition (answering by voice).
// Three modes, switched from the top bar:
//   silent: text only (for public places)
//   listen: questions and answers are read aloud; you answer by typing
//   speak:  read aloud and answer with the microphone
// Everything degrades to text if the browser has no Italian voice or no speech recognition.

let mode = "listen";
const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const hasTTS = typeof speechSynthesis !== "undefined";

export const MODES = ["silent", "listen", "speak"];
export const getMode = () => mode;
export function setMode(m) { mode = MODES.includes(m) ? m : "listen"; if (mode === "silent") { stop(); stopListening(); } }
export const setSilent = v => setMode(v ? "silent" : "listen");        // backwards compatible
export const isSilent = () => mode === "silent";
export const canSpeak = () => mode !== "silent" && hasTTS;
export const canListen = () => mode === "speak" && !!SR;
export const hasRecognition = () => !!SR;

// ---- voices -------------------------------------------------------------------------
let voices = [];
function loadVoices() { if (hasTTS) voices = speechSynthesis.getVoices(); }
if (hasTTS) { loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }
const NICE = /natural|neural|online|google|premium|enhanced/i;
export function pickVoice(lang = "it-IT", pref = "") {
  if (!voices.length) loadVoices();
  const base = lang.slice(0, 2).toLowerCase();
  const same = voices.filter(v => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith(base));
  const exact = same.filter(v => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : same;
  return (pref && pool.find(v => new RegExp(pref, "i").test(v.name))) || pool.find(v => NICE.test(v.name)) || pool[0] || null;
}
export const hasItalianVoice = () => !!pickVoice("it-IT");
export function voiceList() { if (!voices.length) loadVoices(); return voices.filter(v => /^(it|en)/i.test(v.lang)).map(v => ({ name: v.name, lang: v.lang })); }

let preferred = { it: "", en: "" };
export const setPreferredVoice = (lang, name) => { preferred[lang] = name || ""; };

// ---- speaking -----------------------------------------------------------------------
let token = 0;
function utter(text, lang, rate) {
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, "").replace(/\*/g, "").replace(/_{3,}/g, "…"));
    u.lang = lang;
    const v = pickVoice(lang, preferred[lang.slice(0, 2)]); if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => res(true); u.onerror = () => res(false);
    speechSynthesis.speak(u);
    // Chrome sometimes never fires onend for long texts: don't wait forever.
    setTimeout(() => res(true), 1500 + String(text).length * 110 / rate);
  });
}
export async function say(text, { lang = "it-IT", rate = 0.95 } = {}) {
  if (!canSpeak() || !text) return false;
  const my = ++token;
  speechSynthesis.cancel();
  await utter(text, lang, rate);
  return my === token;
}
// Several parts in sequence, possibly in different languages. Interrupted by stop() or a new say().
export async function sayAll(parts, { rate = 0.95 } = {}) {
  if (!canSpeak()) return false;
  const my = ++token;
  speechSynthesis.cancel();
  for (const p of parts.filter(p => p && p.text)) {
    if (my !== token) return false;
    await utter(p.text, p.lang || "it-IT", p.rate || rate);
  }
  return my === token;
}
export function stop() { token++; try { speechSynthesis.cancel(); } catch { /* none */ } }

// ---- listening ----------------------------------------------------------------------
let current = null;
export function stopListening() { try { current && current.abort(); } catch { /* */ } current = null; }

/**
 * Listen once. Resolves with
 *   { alts: [{ text, confidence }], text, confidence, totalMs, speechMs }
 * or { error: "no-speech" | "not-allowed" | "unsupported" | "aborted" | … }.
 * onInterim(text) is called with live partial results.
 */
export function listen({ lang = "it-IT", onInterim, maxMs = 15000, silenceMs = 1800 } = {}) {
  if (!SR) return Promise.resolve({ error: "unsupported" });
  stop();                                   // never listen while the app is talking
  stopListening();
  return new Promise(res => {
    const r = new SR();
    current = r;
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 5; r.continuous = true;
    const t0 = performance.now();
    let speechStart = null, lastResult = null, finals = [], best = null, done = false, silenceTimer = null;
    const finish = out => {
      if (done) return; done = true; clearTimeout(silenceTimer); clearTimeout(maxTimer);
      try { r.stop(); } catch { /* */ }
      if (current === r) current = null;
      res(out);
    };
    const assemble = () => {
      if (!finals.length) return null;
      // Combine segments: first alternative for each, plus whole-utterance alternatives from the longest segment.
      const main = finals.map(f => f[0].transcript.trim()).join(" ").replace(/\s+/g, " ").trim();
      const conf = finals.reduce((s, f) => s + (f[0].confidence || 0), 0) / finals.length;
      const alts = [{ text: main, confidence: conf }];
      if (finals.length === 1) for (let k = 1; k < finals[0].length; k++) alts.push({ text: finals[0][k].transcript.trim(), confidence: finals[0][k].confidence || 0 });
      return { alts, text: main, confidence: conf, totalMs: performance.now() - t0, speechMs: Math.max(300, (lastResult || performance.now()) - (speechStart || t0)) };
    };
    r.onspeechstart = () => { speechStart = speechStart || performance.now(); };
    r.onresult = e => {
      lastResult = performance.now();
      speechStart = speechStart || t0;
      let interim = "";
      finals = [];
      for (let k = 0; k < e.results.length; k++) {
        const res = e.results[k];
        if (res.isFinal) finals.push([...res].map(a => ({ transcript: a.transcript, confidence: a.confidence })));
        else interim += res[0].transcript;
      }
      onInterim && onInterim((finals.map(f => f[0].transcript).join(" ") + " " + interim).trim());
      best = assemble();
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => finish(assemble() || { error: "no-speech" }), silenceMs);
    };
    r.onerror = e => finish(best || { error: e.error || "error" });
    r.onend = () => finish(assemble() || best || { error: "no-speech" });
    const maxTimer = setTimeout(() => finish(assemble() || { error: "no-speech" }), maxMs);
    try { r.start(); } catch (e) { finish({ error: "busy" }); }
  });
}

export const MIC_HELP = {
  "not-allowed": "The microphone is blocked. Click the 🔒 or 🎤 icon in the address bar and allow the microphone for this site.",
  "service-not-allowed": "Speech recognition isn't allowed here. Use Chrome or Edge, and open the app from localhost or https.",
  "no-speech": "I didn't hear anything. Tap the microphone and speak.",
  "audio-capture": "No microphone found.",
  "network": "Speech recognition needs an internet connection in Chrome.",
  "unsupported": "This browser can't do speech recognition. Use Chrome or Edge, or type your answer."
};
