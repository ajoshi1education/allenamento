// Domain layer: every answer from every activity goes through recordAnswer(),
// which logs it, updates skill and concept progress, and feeds the Error Bank.
import { captureMistake, recordSuccess, relatedErrors, errorId } from "./core/errors.js";
import { newCard, review, DAY } from "./core/srs.js";
import { dedupe, detectGrammar, itemsFromImport } from "./core/importer.js";

const VOCAB_ERRORS = ["vocabulary", "false-friend", "collocation", "idiom", "word-formation"];
export const SKILLS =["grammar", "vocabulary", "reading", "listening", "writing", "speaking", "interaction"];

export function createStore(db, content, clock) {
  const listeners = new Set();
  const emit = what => listeners.forEach(fn => fn(what));
  // All writes go through one queue so read-modify-write updates never overwrite each other
  // (e.g. saving a note while toggling "reviewed").
  let chain = Promise.resolve();
  const serial = fn => (...args) => { const p = chain.then(() => fn(...args)); chain = p.catch(() => {}); return p; };

  async function updateSkill(skill, correct, weight = 1) {
    const s = (await db.get("skills", skill)) || { skill, attempts: 0, correct: 0, ewma: 0.5, lastT: 0 };
    s.attempts += 1;
    if (correct) s.correct += 1;
    const alpha = 0.12 * weight;
    s.ewma = s.ewma * (1 - alpha) + (correct ? 1 : 0) * alpha;
    s.lastT = clock();
    await db.put("skills", s);
  }

  async function getProgress(conceptId) {
    return (await db.get("progress", conceptId)) || { conceptId, status: "new", seen: 0, correct: 0, wrong: 0, recent: [], card: null, lastSeen: 0 };
  }

  async function updateProgress(conceptId, correct) {
    const p = await getProgress(conceptId);
    const now = clock();
    p.seen += 1;
    if (correct) p.correct += 1; else p.wrong += 1;
    p.recent = [...(p.recent || []), correct ? 1 : 0].slice(-12);
    p.lastSeen = now;
    if (p.status === "new") p.status = "learning";
    const acc = p.recent.reduce((a, b) => a + b, 0) / p.recent.length;
    if (p.recent.length >= 8 && acc >= 0.85 && p.status === "learning") {
      p.status = "mastered";
      p.card = review(p.card || newCard(now), 4, now);
    } else if (!correct && (p.status === "mastered" || p.status === "known" || p.status === "skipped") && acc < 0.6) {
      p.status = "learning";          // forgotten: back into active learning
    }
    await db.put("progress", p);
    return p;
  }

  // Mark a concept as already known (skip it). It will come back for a check-up later.
  const setKnown = serial(async function setKnown(conceptId, status = "skipped", days = 21) {
    const p = await getProgress(conceptId);
    const now = clock();
    p.status = status;
    p.card = { ...newCard(now), reps: 1, interval: days, due: now + days * DAY };
    await db.put("progress", p);
    emit("progress");
  });

  // Periodic check-up of a concept you skipped, placed out of or mastered.
  // Passing pushes the next check-up further away; failing puts it back into active learning.
  const checkup = serial(async function checkup(conceptId, accuracy) {
    const p = await getProgress(conceptId);
    const now = clock();
    const passed = accuracy >= 0.8;
    if (passed) p.card = review(p.card || newCard(now), accuracy >= 0.95 ? 5 : 4, now);
    else { p.status = "learning"; p.card = null; }
    p.lastCheckup = { t: now, accuracy, passed };
    await db.put("progress", p);
    emit("progress");
    return p;
  });

  const recordAnswer = serial(async function recordAnswer({ item, response, result, source, mode = "practice", retestOf = null }) {
    const now = clock();
    const concept = content.concepts.get(item.conceptId);
    const skill = item.skill || (concept && concept.skill) || "grammar";
    await db.put("attempts", {
      t: now, itemId: item.id, conceptId: item.conceptId, skill, source, mode,
      response: String(response ?? ""), verdict: result.verdict, correct: result.correct, errorType: result.errorType || null
    });
    await updateSkill(skill, result.correct && result.verdict !== "accent");
    if (item.interaction) await updateSkill("interaction", result.correct);
    await updateProgress(item.conceptId, result.correct);

    const out = { captured: null, credited: [], mastered: [], reopened: false };
    const meaningfulMistake = !result.correct || result.verdict === "accent";

    if (retestOf) {
      const target = await db.get("errors", retestOf);
      if (target && !result.correct) {
        const updated = captureMistake(target, { item, concept, response, result, source, now });
        await db.put("errors", updated);
        out.captured = updated;
        out.reopened = target.status === "mastered";
      }
    }
    if (meaningfulMistake && !(out.captured && out.captured.errorType === result.errorType)) {
      const id = errorId(item.id, result.errorType);
      const existing = await db.get("errors", id);
      const e = captureMistake(existing, { item, concept, response, result, source, now });
      await db.put("errors", e);
      out.captured = out.captured || e;
      if (existing && existing.status === "mastered") out.reopened = true;
    }
    if (result.correct) {
      const all = await db.all("errors");
      const targets = relatedErrors(all, item, now).filter(e => !(result.verdict === "accent" && e.errorType === "accent"));
      if (retestOf && !targets.some(e => e.id === retestOf)) {
        const t = all.find(e => e.id === retestOf);
        if (t) targets.push(t);
      }
      for (const e of targets) {
        const u = recordSuccess(e, { item, response, source, now });
        await db.put("errors", u);
        out.credited.push(u);
        if (u.status === "mastered" && e.status !== "mastered") out.mastered.push(u);
      }
    }
    // Vocabulary-type mistakes also become flashcards, so the word itself gets spaced repetition.
    if (out.captured && VOCAB_ERRORS.includes(out.captured.errorType) && !out.reopened && !item.noVocabCard) {
      const it = item.type === "cloze" ? item.prompt.replace(/_{3,}/, result.expected).replace(/\s*\([^)]*\)/, "") : result.expected;
      await saveVocabRaw({ it, en: item.en || (item.type === "translate" ? item.prompt : ""), pos: "expr", def: result.note || result.why || "", conceptIds: [item.conceptId], source: "error", errorId: out.captured.id });
    }
    emit("answer");
    return out;
  });

  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  async function saveVocabRaw(entry) {
    const now = clock();
    const id = entry.id || "u-" + slug(entry.it);
    const old = await db.get("vocab", id);
    const v = { ...(old || {}), ...entry, id, addedAt: old ? old.addedAt : now, updatedAt: now, card: old && old.card ? old.card : newCard(now) };
    if (old && old.source && old.source !== entry.source) v.sources = [...new Set([...(old.sources || [old.source]), entry.source])];
    await db.put("vocab", v);
    return v;
  }

  // ---- Google Translate imports → vocab cards + generated exercises + "My phrases" games ----
  const importRows = serial(async (rows, meta = {}) => {
    const existing = new Set((await db.all("imports")).map(r => r.id));
    const { rows: fresh, dupes } = dedupe(rows, existing);
    const now = clock();
    const batch = "b" + now;
    for (const r of fresh) {
      const grammar = r.it ? detectGrammar(r.it) : [];
      await db.put("imports", { ...r, grammar, importedAt: now, batch, file: meta.file || "", format: meta.format || "" });
      if (r.it && r.en) await saveVocabRaw({ id: "v-" + r.id, it: r.it, en: r.en, pos: r.it.includes(" ") ? "expr" : "noun", def: "From your Google Translate history", source: "import", conceptIds: grammar.map(g => g.conceptId), examples: [] });
    }
    await registerImports();
    emit("imports");
    return { added: fresh.length, dupes, incomplete: fresh.filter(r => r.incomplete).length };
  });

  async function registerImports() {
    const rows = (await db.all("imports")).filter(r => r.it && !r.incomplete);
    if (!content.concepts.has("VOCAB")) content.concepts.set("VOCAB", { id: "VOCAB", title: "Vocabulary review", skill: "vocabulary", cefr: "B2", rule: "Words and expressions from your vocabulary deck.", assessment: [], exercises: [] });
    if (!content.concepts.has("MY-PHRASES")) {
      content.concepts.set("MY-PHRASES", { id: "MY-PHRASES", title: "My translated phrases", skill: "vocabulary", cefr: "B2", rule: "Phrases from your own Google Translate history.", assessment: [], exercises: [] });
    }
    // drop previously registered import items, then rebuild
    for (const [id, it] of content.items) if (it.source === "import") content.items.delete(id);
    for (const [cid, list] of content.byConcept) content.byConcept.set(cid, list.filter(i => i.source !== "import"));
    content.importItems = [];
    for (const r of rows) for (const it of itemsFromImport(r, rows)) {
      content.items.set(it.id, it);
      if (!content.byConcept.has(it.conceptId)) content.byConcept.set(it.conceptId, []);
      content.byConcept.get(it.conceptId).push(it);
      content.importItems.push(it);
    }
    const games = [
      { id: "G-MINE-01", type: "gauntlet", title: "My phrases: gauntlet", subtitle: "Timed challenge built from your own Google Translate history.", importOnly: true },
      { id: "G-MINE-02", type: "duel", title: "My phrases: duel", subtitle: "Race a rival translating your own phrases.", importOnly: true, rival: { name: "Giulia", avatar: "👩‍🦰" } },
      { id: "G-MINE-03", type: "builder", title: "My phrases: builder", subtitle: "Rebuild your saved phrases word by word.", importOnly: true }
    ];
    for (const g of games) {
      if (content.importItems.length >= 4) { content.games.set(g.id, { ...g, conceptIds: ["MY-PHRASES"], difficulty: 2, minutes: 5 }); content.gamesByConcept.set("MY-PHRASES", games.map(x => x.id)); }
      else content.games.delete(g.id);
    }
    return content.importItems.length;
  }

  return {
    db, content, clock, serial,
    importRows, registerImports,
    imports: () => db.all("imports"),
    updateImport: serial(async (id, patch) => {
      const r = await db.get("imports", id); if (!r) return null;
      Object.assign(r, patch);
      if (r.it && r.en) { r.incomplete = false; r.grammar = detectGrammar(r.it); await saveVocabRaw({ id: "v-" + r.id, it: r.it, en: r.en, pos: "expr", def: "From your Google Translate history", source: "import", conceptIds: r.grammar.map(g => g.conceptId), examples: [] }); }
      await db.put("imports", r); await registerImports(); emit("imports"); return r;
    }),
    deleteImport: serial(async id => { await db.del("imports", id); await registerImports(); emit("imports"); }),
    on: fn => (listeners.add(fn), () => listeners.delete(fn)),
    emit,
    recordAnswer, getProgress, setKnown, checkup,
    allProgress: () => db.all("progress"),
    skills: () => db.all("skills"),
    errors: () => db.all("errors"),
    getError: id => db.get("errors", id),
    updateError: serial(async (id, patch) => {
      const e = await db.get("errors", id);
      if (!e) return null;
      Object.assign(e, patch, { updatedAt: clock() });
      await db.put("errors", e);
      emit("errors");
      return e;
    }),
    deleteError: serial(async id => { await db.del("errors", id); emit("errors"); }),
    attempts: () => db.all("attempts"),
    saveVocab: serial(async entry => { const v = await saveVocabRaw(entry); emit("vocab"); return v; }),
    vocab: () => db.all("vocab"),
    reviewVocab: serial(async (id, grade) => {
      const v = await db.get("vocab", id);
      if (!v) return null;
      v.card = review(v.card || newCard(clock()), grade, clock());
      v.reviews = (v.reviews || 0) + 1;
      if (grade < 3) v.lapses = (v.lapses || 0) + 1;
      await db.put("vocab", v);
      emit("vocab");
      return v;
    }),
    updateVocab: serial(async (id, patch) => { const v = await db.get("vocab", id); if (!v) return null; Object.assign(v, patch, { updatedAt: clock() }); await db.put("vocab", v); emit("vocab"); return v; }),
    deleteVocab: serial(async id => { await db.del("vocab", id); emit("vocab"); }),
    async setting(key, fallback) { const s = await db.get("settings", key); return s ? s.value : fallback; },
    async setSetting(key, value) { await db.put("settings", { key, value }); emit("settings"); }
  };
}
