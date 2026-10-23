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
// Chrome only lets a page talk after the user has clicked or tapped on it ("not-allowed" otherwise).
// Once one utterance has played, later ones (e.g. reading the next question automatically) are fine.
// So: the first click anywhere plays a silent utterance to unlock audio, and if speech is still
// blocked we tell the app ("tts-blocked" event) so it can show a "tap to turn on sound" prompt.
let token = 0;
let unlocked = false;
const keep = [];                       // Chrome bug: utterances can be garbage-collected mid-speech
export const audioUnlocked = () => unlocked;
export function unlock() {
  if (unlocked || !hasTTS) return;
  try {
    const u = new SpeechSynthesisUtterance("ok");   // whitespace-only text is ignored by Chrome
    u.volume = 0; u.rate = 2;
    const v = pickVoice("it-IT"); if (v) u.voice = v;
    u.onstart = u.onend = () => { unlocked = true; };
    keep.push(u); speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
if (typeof document !== "undefined") {
  const first = () => { unlock(); };
  document.addEventListener("pointerdown", first, { capture: true });
  document.addEventListener("keydown", first, { capture: true });
}

// Google's online voices stop after ~15 s of continuous text, so long texts go in sentence chunks.
function chunks(text) {
  const parts = String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [String(text)];
  const out = []; let cur = "";
  for (const p of parts) { if ((cur + p).length > 180 && cur) { out.push(cur); cur = p; } else cur += p; }
  if (cur.trim()) out.push(cur);
  return out;
}

function utter(text, lang, rate) {
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, "").replace(/\*/g, "").replace(/_{3,}/g, "…"));
    u.lang = lang;
    const v = pickVoice(lang, preferred[lang.slice(0, 2)]); if (v) u.voice = v;
    u.rate = rate;
    let started = false;
    u.onstart = () => { started = true; unlocked = true; };
    u.onend = () => res(true);
    u.onerror = e => {
      if (e.error === "not-allowed") { unlocked = false; window.dispatchEvent(new CustomEvent("tts-blocked")); }
      res(false);
    };
    keep.push(u); if (keep.length > 20) keep.shift();
    speechSynthesis.speak(u);
    if (speechSynthesis.paused) speechSynthesis.resume();
    // Safety net: if Chrome never reports the end, don't wait forever (generous: online voices can be slow to start).
    setTimeout(() => res(started), 4000 + String(text).length * 120 / rate);
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function speakParts(parts, rate) {
  const my = ++token;
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); await pause(60); }  // Chrome drops speak() right after cancel()
  for (const p of parts) for (const c of chunks(p.text)) {
    if (my !== token) return false;
    const ok = await utter(c, p.lang || "it-IT", p.rate || rate);
    if (!ok && !unlocked) return false;      // blocked: stop here, the app shows "tap to turn on sound"
  }
  return my === token;
}
export async function say(text, { lang = "it-IT", rate = 0.95 } = {}) {
  if (!canSpeak() || !text) return false;
  return speakParts([{ text, lang }], rate);
}
// Several parts in sequence, possibly in different languages. Interrupted by stop() or a new say().
export async function sayAll(parts, { rate = 0.95 } = {}) {
  if (!canSpeak()) return false;
  return speakParts(parts.filter(p => p && p.text), rate);
}
export function stop() { token++; try { speechSynthesis.cancel(); } catch { /* none */ } }

// ---- microphone permission ------------------------------------------------------------
export async function micPermission() {
  try { return (await navigator.permissions.query({ name: "microphone" })).state; } catch { return "unknown"; }
}
// Ask for the microphone with Chrome's standard prompt (call from a click). Returns "granted" or an error code.
export async function ensureMic() {
  const st = await micPermission();
  if (st === "granted") return "granted";
  if (st === "denied") return "not-allowed";
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    return "granted";
  } catch (e) {
    return e.name === "NotAllowedError" ? "not-allowed" : e.name === "NotFoundError" ? "audio-capture" : "error";
  }
}

// ---- listening ----------------------------------------------------------------------
let current = null;
export function stopListening() { try { current && current.abort(); } catch { /* */ } current = null; }

/**
 * Listen once. Resolves with
 *   { alts: [{ text, confidence }], text, confidence, totalMs, speechMs }
 * or { error: "no-speech" | "not-allowed" | "unsupported" | "aborted" | … }.
 * onInterim(text) is called with live partial results.
 */
export async function listen({ lang = "it-IT", onInterim, onStatus, maxMs = 15000, silenceMs = 1800 } = {}) {
  if (!SR) return { error: "unsupported" };
  stop();                                   // never listen while the app is talking
  stopListening();
  // Make sure we have the microphone first, with Chrome's normal permission prompt.
  const perm = await micPermission();
  if (perm === "denied") return { error: "not-allowed" };
  if (perm !== "granted") {
    onStatus && onStatus("permission");
    const g = await ensureMic();
    if (g !== "granted") return { error: g };
  }
  return new Promise(res => {
    const r = new SR();
    current = r;
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 5; r.continuous = true;
    const t0 = performance.now();
    let speechStart = null, lastResult = null, finals = [], best = null, done = false, silenceTimer = null, maxTimer = null, audioOn = false;
    const finish = out => {
      if (done) return; done = true; clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(watch); clearTimeout(hardCap);
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
    // The listening time only starts once Chrome is actually recording.
    r.onaudiostart = () => {
      audioOn = true; onStatus && onStatus("listening");
      maxTimer = setTimeout(() => finish(assemble() || { error: "no-speech" }), maxMs);
    };
    const watch = setTimeout(() => { if (!audioOn) onStatus && onStatus("stuck"); }, 3000);
    const hardCap = setTimeout(() => finish(assemble() || { error: audioOn ? "no-speech" : "not-started" }), maxMs + 30000);
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
    try { r.start(); } catch (e) { finish({ error: "busy" }); }
  });
}

export const MIC_STATUS = {
  permission: "Chrome is asking to use your microphone: click Allow in the box at the top of the window.",
  stuck: "Waiting for the microphone… If Chrome is asking for permission, click Allow (or the 🎤 icon in the address bar).",
  listening: "Ti ascolto…"
};

export const MIC_HELP = {
  "not-allowed": "The microphone is blocked. Click the 🔒 or 🎤 icon in the address bar and allow the microphone for this site.",
  "service-not-allowed": "Speech recognition isn't allowed here. Use Chrome or Edge, and open the app from localhost or https.",
  "no-speech": "I didn't hear anything. Tap the microphone and speak.",
  "not-started": "The microphone didn't start. Check that Chrome is allowed to use it (🎤 icon in the address bar) and that no other app is using it.",
  "error": "The microphone couldn't start. Check it's connected and allowed in Chrome.",
  "audio-capture": "No microphone found.",
  "network": "Speech recognition needs an internet connection in Chrome.",
  "unsupported": "This browser can't do speech recognition. Use Chrome or Edge, or type your answer."
};
