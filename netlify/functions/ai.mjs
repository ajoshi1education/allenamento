// Optional AI helper (POST /api/ai). Switched off unless ANTHROPIC_API_KEY is set in Netlify's
// environment variables. The key stays on the server; the browser only sees the results.
// Tasks are whitelisted, and the browser re-checks every generated item with the normal answer
// checker before using it.

const MAX_BODY = 8000;

export default async (req) => {
  if (req.method === "GET") return json({ enabled: !!process.env.ANTHROPIC_API_KEY });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ enabled: false, error: "AI is not configured" }, 501);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { z } = await import("zod");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const client = new Anthropic();

  const SYSTEM = "You write Italian exercises and feedback for an English-speaking adult learner moving from B2 to C1. " +
    "Italian must be natural, correct, contemporary standard Italian. Explanations are in English, short and tutor-like. " +
    "Never produce an exercise whose answer is debatable: list every valid alternative answer.";

  try {
    if (body.task === "retest") {
      const Item = z.object({
        type: z.enum(["cloze", "translate"]),
        prompt: z.string().describe("cloze: Italian sentence containing ___ once, with the base form in brackets; translate: English sentence"),
        answers: z.array(z.string()).describe("every correct answer (cloze: the gap filler; translate: full Italian sentences)"),
        wrong: z.array(z.string()).describe("the typical wrong answers this mistake produces (same shape as answers)"),
        en: z.string().describe("English meaning of the full sentence"),
        explanation: z.string()
      });
      const out = await client.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(z.object({ items: z.array(Item) })) },
        system: SYSTEM,
        messages: [{ role: "user", content:
          `Write ${Math.min(Number(body.count) || 3, 5)} NEW exercises (new sentences, new contexts) that retest this mistake.\n` +
          `Concept: ${clip(body.concept)}\nRule: ${clip(body.rule)}\nMistake type: ${clip(body.errorType)}\n` +
          `Original exercise: ${clip(body.prompt)}\nLearner wrote: ${clip(body.userAnswer)}\nCorrect: ${clip(body.correctAnswer)}` }]
      });
      return json({ items: out.parsed_output ? out.parsed_output.items : [] });
    }
    if (body.task === "writing") {
      const Fb = z.object({
        corrections: z.array(z.object({ original: z.string(), corrected: z.string(), why: z.string(),
          errorType: z.enum(["grammar", "wrong-mood", "verb-form", "agreement", "preposition", "vocabulary", "collocation", "register", "connector", "spelling", "word-order", "tense-sequence"]) })),
        overall: z.string(),
        improved: z.string().describe("the learner's text rewritten as a polished C1 version, keeping their ideas")
      });
      const out = await client.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 6000,
        output_config: { effort: "medium", format: zodOutputFormat(Fb) },
        system: SYSTEM,
        messages: [{ role: "user", content: `Task: ${clip(body.prompt, 1200)}\n\nLearner's text:\n${clip(body.text, 4000)}\n\nList the meaningful mistakes (not style preferences), then give overall feedback and an improved version.` }]
      });
      return json(out.parsed_output || { corrections: [], overall: "", improved: "" });
    }
    return json({ error: "unknown task" }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

const clip = (s, n = 400) => String(s ?? "").slice(0, n);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
