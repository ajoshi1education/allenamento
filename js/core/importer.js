// Google Translate history import. There is no personal API, so we accept what Google actually exports:
//  1. Saved translations → "Export to Google Sheets" → File › Download › CSV (or TSV).
//     Rows are: source language, target language, source text, translation (no header).
//  2. Google Takeout → My Activity → Translate (JSON or HTML). Often only the looked-up text.
//  3. Pasted lines: "text<TAB>translation", "text = translation", "text — translation", or one phrase per line.
// Everything is turned into {it, en} pairs, de-duplicated, then into vocab cards and exercises.

const LANG_IT = /^(italian|italiano|italien|italienisch|italiano \(italia\)|it)$/i;
const LANG_EN = /^(english|inglese|anglais|englisch|ingl[eé]s|en)$/i;
const LANG_ANY = /^(english|italian|inglese|italiano|french|francese|spanish|spagnolo|german|tedesco|portuguese|detect language|rileva lingua|[a-z]{2}(-[a-z]{2})?)$/i;

export function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/\t/g) || []).length ? "\t" : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
}

// Rough language guess for unlabeled text: counts typical Italian vs English function words and endings.
const IT_WORDS = new Set("il lo la i gli le un una di da in con su per tra fra che non è sono ho hai ha abbiamo del della dei degli delle al alla nel nella questo questa quello come anche ma perché più molto mi ti si ci vi ne cosa sei siamo essere avere fare io tu lui lei noi voi loro".split(" "));
const EN_WORDS = new Set("the a an of to in on at for with is are was were be been have has had do does did not and or but this that these those it he she we they you i my your his her their what which who how why very more".split(" "));
export function guessLang(s) {
  const w = String(s).toLowerCase().normalize("NFC").match(/[a-zàèéìòù']+/g) || [];
  let it = 0, en = 0;
  for (const x of w) {
    if (IT_WORDS.has(x)) it += 2;
    if (EN_WORDS.has(x)) en += 2;
    if (/[àèéìòù]/.test(x)) it += 2;
    if (/(zione|mente|are|ere|ire|ato|uto|ito|etto|issimo)$/.test(x)) it += 1;
    if (/(ing|tion|ly|ed|th|ough)$/.test(x) || /^th/.test(x) || /w/.test(x) || /k/.test(x)) en += 1;
    if (/[aeiou]$/.test(x) && x.length > 2) it += 0.5; else if (x.length > 2) en += 0.5;
  }
  if (!w.length || Math.abs(it - en) < 1) return "?";
  return it > en ? "it" : "en";
}

function pair(a, b, langA, langB, source) {
  a = (a || "").trim(); b = (b || "").trim();
  if (!a && !b) return null;
  let la = langA || guessLang(a), lb = langB || (b ? guessLang(b) : "?");
  if (la === "?" && lb === "en") la = "it";
  if (la === "?" && lb === "it") la = "en";
  if (lb === "?" && la === "it" && b) lb = "en";
  if (lb === "?" && la === "en" && b) lb = "it";
  if (la === "it") return { it: a, en: b, direction: "it→en", source };
  if (lb === "it") return { it: b, en: a, direction: "en→it", source };
  if (!b && la === "?") return { it: a, en: "", direction: "?", source };
  // An English lookup with no translation in the export: keep it, so you can add the Italian.
  if (!b && la === "en") return { it: "", en: a, direction: "en→it", source, incomplete: true };
  return null;  // not Italian ↔ English
}

const langCode = s => (LANG_IT.test(s) ? "it" : LANG_EN.test(s) ? "en" : s && LANG_ANY.test(s) ? "other" : null);

export function parseSavedSheet(text) {
  const rows = parseDelimited(text);
  const out = [];
  for (const r of rows) {
    if (r.length >= 4 && langCode(r[0]) && langCode(r[1])) {
      const la = langCode(r[0]), lb = langCode(r[1]);
      if (la === "other" || lb === "other") { if (!(la === "other" && /detect|rileva/i.test(r[0]))) continue; }
      out.push(pair(r[2], r[3], la === "other" ? null : la, lb === "other" ? null : lb, "gt-saved"));
    } else if (r.length === 2 || r.length === 3) {
      if (/^(source|target|text|testo|original|translation|traduzione)$/i.test(r[0])) continue;  // header row
      out.push(pair(r[0], r[1], null, null, "csv"));
    } else if (r.length === 1) out.push(pair(r[0], "", null, null, "csv"));
  }
  return out.filter(Boolean);
}

// Google Takeout "My Activity" for Translate: JSON array of { header, title, titleUrl, time, products }.
export function parseTakeoutJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
  const out = [];
  for (const rec of arr) {
    const tag = [rec.header, ...(rec.products || []), rec.titleUrl].join(" ");
    if (!/translat|traduttore|traduci/i.test(tag)) continue;
    const text1 = extractQueried(rec.title || "", rec.titleUrl || "");
    if (!text1) continue;
    const details = (rec.details || []).map(d => d.name).join(" ");
    const sl = urlParam(rec.titleUrl, "sl");
    const p = pair(text1, extractTranslation(rec.subtitles || details), sl === "it" ? "it" : sl === "en" ? "en" : null, null, "takeout");
    if (p) out.push({ ...p, t: rec.time ? Date.parse(rec.time) : null });
  }
  return out;
}

function extractQueried(title, url) {
  const m = title.match(/[“"«](.+?)[”"»]/);
  if (m) return m[1];
  try {
    const u = new URL(url);
    const t = u.searchParams.get("text") || u.searchParams.get("q") || (u.hash.match(/(?:#|\/)(?:[a-z-]+\/){2}(.+)$/) || [])[1];
    if (t) return decodeURIComponent(t.replace(/\+/g, " "));
  } catch { /* not a URL */ }
  const after = title.replace(/^(translated|tradotto|hai tradotto|searched for|ricerca)\s*/i, "").trim();
  return after && after !== title ? after : null;
}
function urlParam(url, k) { try { return new URL(url).searchParams.get(k); } catch { return null; } }
function extractTranslation(sub) {
  if (!sub) return "";
  if (Array.isArray(sub)) return sub.map(s => s.name || s).join(" ").trim();
  return String(sub).trim();
}

// Takeout HTML: the same records rendered as cards. We read each card's text.
export function parseTakeoutHtml(html) {
  const cards = html.split(/<div class="outer-cell/i).slice(1);
  const out = [];
  for (const c of cards) {
    if (!/translat|traduttore/i.test(c)) continue;
    const text = c.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "\n").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    const href = (c.match(/href="([^"]+)"/) || [])[1] || "";
    const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
    const titleLine = lines.find(l => /^(translated|tradotto|hai tradotto)/i.test(l)) || lines[1] || "";
    const q = extractQueried(titleLine, href.replace(/&amp;/g, "&"));
    if (!q) continue;
    const p = pair(q, "", null, null, "takeout");
    if (p) out.push(p);
  }
  return out;
}

export function parsePasted(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/\t| = | — | – | -> | → | \| /);
    return pair(parts[0], parts.slice(1).join(" ").trim(), null, null, "paste");
  }).filter(Boolean);
}

export function detectAndParse(text, filename = "") {
  const t = text.replace(/^﻿/, "");
  if (/\.json$/i.test(filename) || /^\s*[[{]/.test(t)) return { format: "takeout-json", rows: parseTakeoutJson(t) };
  if (/\.html?$/i.test(filename) || /<html|outer-cell/i.test(t)) return { format: "takeout-html", rows: parseTakeoutHtml(t) };
  if (/\.(csv|tsv)$/i.test(filename) || /^[^\n]*(,|\t)[^\n]*\n/.test(t)) {
    const rows = parseSavedSheet(t);
    if (rows.length) return { format: rows.some(r => r.source === "gt-saved") ? "gt-saved" : "csv", rows };
  }
  return { format: "paste", rows: parsePasted(t) };
}

const norm = s => String(s).toLowerCase().normalize("NFC").replace(/[’']/g, "'").replace(/[.,!?;:"«»]/g, "").replace(/\s+/g, " ").trim();
export const importId = r => "imp-" + hash(norm(r.it) + "|" + norm(r.en));
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export function dedupe(rows, existingIds = new Set()) {
  const seen = new Set(existingIds), out = [];
  let dupes = 0;
  for (const r of rows) {
    if (!r.it && !r.en) continue;
    const id = importId(r);
    if (seen.has(id)) { dupes++; continue; }
    seen.add(id);
    out.push({ ...r, id });
  }
  return { rows: out, dupes };
}

// ---- Grammar detection in your own phrases → links to curriculum concepts ----
export const GRAMMAR_PATTERNS = [
  { conceptId: "B2-SUBJ-01", re: /\b(che|affinché|benché|sebbene|prima che|purché)\s+(\w+\s+)?(sia|siano|abbia|abbiano|possa|possano|faccia|facciano|vada|vadano|sappia|sappiano|voglia|vogliano|stia|stiano|venga|vengano|debba|debbano|dica|dicano)\b/i, label: "subjunctive" },
  { conceptId: "B2-SUBJ-03", re: /\b(fossi|fosse|fossimo|foste|fossero|avessi|avesse|avessimo|aveste|avessero|facessi|facesse|potessi|potesse|dovessi|dovesse|andassi|andasse|sapessi|sapesse)\b/i, label: "imperfect subjunctive" },
  { conceptId: "B2-COND-01", re: /\b\w+(rei|resti|rebbe|remmo|reste|rebbero)\b/i, label: "conditional" },
  { conceptId: "B2-HYP-01", re: /\bse\s+\w+/i, label: "if-clause" },
  { conceptId: "B2-PRON-01", re: /\b(glielo|gliela|glieli|gliele|gliene|me lo|me la|me li|me le|te lo|te la|ce lo|se lo|se la|ve lo|me ne|te ne|se ne|ce ne)\b|\w+(melo|mela|telo|tela|glielo|gliela|cene|mene)\b/i, label: "combined pronouns" },
  { conceptId: "B2-PRON-02", re: /\b(ce n'è|ce ne sono|ne ho|ne hai|ne abbiamo|ci penso|ci vuole|ci vogliono|ne parlo|non ne)\b/i, label: "ci / ne" },
  { conceptId: "C1-PRON-03", re: /\b(andarsene|me ne vado|te ne vai|se ne va|farcela|ce la faccio|ce l'ho fatta|cavarsela|prendersela|me la cavo|metterci|volerci|avercela)\b/i, label: "pronominal verb" },
  { conceptId: "C1-PAST-03", re: /\b(fu|furono|ebbe|ebbero|disse|dissero|fece|fecero|venne|vennero|nacque|morì|scrisse|vide|prese|mise|andò|arrivò|parlò)\b/i, label: "passato remoto" },
  { conceptId: "B2-SI-01", re: /\bsi\s+(vende|vendono|dice|parla|mangia|può|deve|fa|fanno|usa|usano|trova|trovano)\b/i, label: "si construction" },
  { conceptId: "B2-PASS-01", re: /\b(viene|vengono|venne|è stat[oaie]|sono stat[ie]|fu|furono)\s+\w+(ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite|tto|tta)\b/i, label: "passive" },
  { conceptId: "B2-INF-01", re: /\b\w+(ando|endo)\b/i, label: "gerund" },
  { conceptId: "B2-PREP-01", re: /\b(riuscire|riesco|riesci|riesce|cercare|cerco|smettere|smetto|decidere|decido|ho deciso|continuare|continuo|provare|provo)\s+(a|di)\s+\w+/i, label: "verb + preposition" }
];

export function detectGrammar(it) {
  return GRAMMAR_PATTERNS.filter(p => p.re.test(it)).map(p => ({ conceptId: p.conceptId, label: p.label, match: (it.match(p.re) || [""])[0] }));
}

const STOP = new Set([...IT_WORDS, "e", "o", "a", "è", "c'è", "l'", "un'"]);

// Exercises from one imported phrase. conceptId: the detected grammar concept if any, else MY-PHRASES.
export function itemsFromImport(r, pool = []) {
  if (!r.it || r.incomplete) return [];
  const words = r.it.split(/\s+/);
  const g = detectGrammar(r.it)[0];
  const conceptId = g ? g.conceptId : "MY-PHRASES";
  const base = { conceptId, source: "import", importId: r.id, noVocabCard: true, skill: g ? "grammar" : "vocabulary", difficulty: words.length > 6 ? 3 : 2, origin: "Google Translate" };
  const items = [];
  const clean = s => s.replace(/[.!?]+$/, "");
  if (r.en) {
    items.push({ ...base, id: r.id + ".tr", type: "translate", instruction: "Translate into Italian. This is from your Google Translate history.", prompt: r.en,
      answers: [clean(r.it).replace(/[()[\]|]/g, " ")], errorType: g ? "grammar" : "vocabulary", typoTolerance: true,
      explanation: g ? `Your phrase uses a ${g.label} (*${g.match}*).` : "From your own translation history." });
    const others = pool.filter(o => o.id !== r.id && o.en).map(o => o.en);
    if (others.length >= 3) {
      const opts = shuffleSeeded([r.en, ...pickSeeded(others, 3, r.id)], r.id);
      items.push({ ...base, id: r.id + ".mc", type: "choice", difficulty: 1, instruction: "What does this mean?", prompt: r.it, options: opts, answer: opts.indexOf(r.en), errorType: "vocabulary", explanation: `*${r.it}* = ${r.en}` });
    }
  }
  // Cloze: hide the grammar form if we found one, else the longest content word.
  if (words.length >= 3) {
    let target = g ? g.match.split(/\s+/).pop() : null;
    if (!target || !words.some(w => w.replace(/[.,!?;:]/g, "") === target)) {
      target = words.map(w => w.replace(/[.,!?;:"«»]/g, "")).filter(w => w.length > 3 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    }
    if (target) {
      const i = words.findIndex(w => w.replace(/[.,!?;:"«»]/g, "") === target);
      const prompt = words.map((w, k) => (k === i ? w.replace(target, "___") : w)).join(" ");
      items.push({ ...base, id: r.id + ".cz", type: "cloze", instruction: r.en ? `Complete your phrase. Meaning: "${r.en}"` : "Complete your phrase.", prompt,
        answers: [target], focus: [target], errorType: g ? "grammar" : "vocabulary", en: r.en, explanation: g ? `The missing form is a ${g.label}.` : "" });
    }
  }
  return items;
}

function seeded(seed) { let h = 0; for (const c of seed) h = Math.imul(31, h) + c.charCodeAt(0) | 0; return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
function shuffleSeeded(a, seed) { const r = seeded(seed), b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function pickSeeded(a, n, seed) { return shuffleSeeded([...new Set(a)], seed + "x").slice(0, n); }
