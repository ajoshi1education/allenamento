// Verb trainer: turns content/verbs.json into drill items (verb + tense + person → form).
export const TENSES = [
  { id: "presente", label: "Presente", concept: "B2-PAST-01", che: false },
  { id: "imperfetto", label: "Imperfetto", concept: "B2-PAST-01", che: false },
  { id: "passato_prossimo", label: "Passato prossimo", concept: "B2-PAST-01", che: false },
  { id: "futuro", label: "Futuro", concept: "B2-FUT-01", che: false },
  { id: "condizionale", label: "Condizionale", concept: "B2-COND-01", che: false },
  { id: "congiuntivo", label: "Congiuntivo presente", concept: "B2-SUBJ-01", che: true },
  { id: "congiuntivo_imperfetto", label: "Congiuntivo imperfetto", concept: "B2-SUBJ-03", che: true },
  { id: "passato_remoto", label: "Passato remoto", concept: "C1-PAST-03", che: false },
  { id: "imperativo", label: "Imperativo", concept: "B2-PRON-04", che: false }
];
export const PERSONS = ["io", "tu", "lui/lei", "noi", "voi", "loro"];
const IMP = ["tu", "lei", "noi", "voi"];
const ESSERE = ["sono", "sei", "è", "siamo", "siete", "sono"];
const AVERE = ["ho", "hai", "ha", "abbiamo", "avete", "hanno"];

// Passato prossimo is built from the auxiliary and participle (agreement shown as -o/-a, -i/-e).
export function passatoProssimo(v, p) {
  const essere = v.aux === "essere";
  const part = v.participio;
  if (!essere) return [`${AVERE[p]} ${part}`];
  const stem = part.slice(0, -1);
  const ends = p < 3 ? ["o", "a"] : ["i", "e"];
  return ends.map(e => `${ESSERE[p]} ${stem}${e}`).concat(v.aux === "avere/essere" ? [`${AVERE[p]} ${part}`] : []);
}

// All accepted forms for one cell (main form first, then alternatives).
export function formsFor(v, tense, p) {
  if (tense === "passato_prossimo") return passatoProssimo(v, p);
  if (tense === "imperativo") {
    const k = IMP[p];
    return [v.imperativo[k], v.imperativo_alt?.[k]].filter(f => f && f !== "—");
  }
  const main = v.tempi[tense]?.[p];
  const alt = v.alt?.[tense]?.[p];
  return [main, ...(Array.isArray(alt) ? alt : alt ? [alt] : [])].filter(Boolean);
}

export function drillItem(v, tense, p) {
  const t = TENSES.find(x => x.id === tense);
  const imp = tense === "imperativo";
  const who = imp ? ["(tu)", "(Lei)", "(noi)", "(voi)"][p] : (t.che ? "che " : "") + ["io", "tu", "lui/lei", "noi", "voi", "loro"][p];
  const forms = formsFor(v, tense, p);
  return {
    id: `verb:${v.inf}:${tense}:${p}`, conceptId: t.concept, skill: "grammar", type: "cloze", difficulty: v.regular ? 2 : v.level === "C1" ? 4 : 3,
    instruction: `Coniuga **${v.inf}** (${v.en}) · *${t.label}*`,
    prompt: `${who} ___${imp ? "!" : ""}`, answers: forms, focus: forms.flatMap(f => f.split(" ")),
    errorType: "verb-form", typoTolerance: false, noVocabCard: true,
    explanation: `${v.inf} · ${t.label}: ${forms[0]}${forms.length > 1 ? ` (anche: ${forms.slice(1).join(", ")})` : ""}.`
  };
}

// Weighted random drill: verbs you got wrong come back more.
export function buildDrill(verbs, { tenses, onlyIrregular = false, level = "", n = 12, wrong = new Map(), rand = Math.random }) {
  const vs = verbs.filter(v => (!onlyIrregular || !v.regular) && (!level || v.level === level));
  if (!vs.length || !tenses.length) return [];
  const out = [], used = new Set();
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const weighted = vs.map(v => ({ v, w: 1 + (wrong.get(v.inf) || 0) * 2 + rand() }));
    weighted.sort((a, b) => b.w - a.w);
    const v = weighted[Math.floor(rand() * Math.min(weighted.length, 12))].v;
    const ok = tenses.filter(t => t !== "imperativo" || formsFor(v, t, 0).length);
    if (!ok.length) continue;
    const tense = ok[Math.floor(rand() * ok.length)];
    const p = Math.floor(rand() * (tense === "imperativo" ? 4 : 6));
    const key = `${v.inf}:${tense}:${p}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push(drillItem(v, tense, p));
  }
  return out;
}

export function wrongCounts(errors) {
  const m = new Map();
  for (const e of errors) if (e.itemId && e.itemId.startsWith("verb:") && e.status !== "mastered") { const inf = e.itemId.split(":")[1]; m.set(inf, (m.get(inf) || 0) + e.timesWrong); }
  return m;
}
