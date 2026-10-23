// Feedback → GitHub issue → applied automatically by a scheduled Claude Code task on the owner's PC.
// No token in the browser: we open GitHub's "new issue" page pre-filled; you press Submit while signed in.
// The scheduled task only acts on issues written by the repo owner (see CLAUDE.md).
export const REPO = "ajoshi1education/allenamento";
export const LABEL = "app-feedback";

let lastItem = null;                      // the exercise on screen most recently (for context)
export const noteItem = item => { lastItem = item ? { id: item.id, conceptId: item.conceptId, type: item.type, prompt: String(item.prompt || "").slice(0, 160) } : null; };

export function context(extra = {}) {
  const ua = navigator.userAgent;
  const device = /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "other";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /safari\//i.test(ua) ? "Safari" : /firefox/i.test(ua) ? "Firefox" : "other";
  return {
    screen: location.hash || "#/path",
    exercise: extra.item || lastItem,
    device, browser,
    installed: matchMedia("(display-mode: standalone)").matches,
    width: innerWidth,
    when: new Date().toISOString().slice(0, 16).replace("T", " ")
  };
}

export function kindOf(text) {
  const t = text.toLowerCase();
  if (/\b(bug|broken|doesn'?t work|not working|error|crash|wrong answer|marked wrong|incorrect|typo|mistake in)\b/.test(t)) return "bug";
  if (/\b(italian|translation|grammar|unnatural)\b|should (also )?be (accepted|correct)|marked (as )?wrong|answer .* should/.test(t)) return "content";
  return "idea";
}

export function issueUrl(text, ctx) {
  const kind = kindOf(text);
  const title = `[${kind}] ${text.replace(/\s+/g, " ").trim().slice(0, 80)}${text.length > 80 ? "…" : ""}`;
  const ex = ctx.exercise;
  const body = [
    "### What I'd like changed",
    text.trim(),
    "",
    "### Context (added by the app)",
    `- Screen: \`${ctx.screen}\``,
    ex ? `- Exercise: \`${ex.id}\` (${ex.type}, concept \`${ex.conceptId}\`): ${ex.prompt}` : "- Exercise: none",
    `- Device: ${ctx.device} · ${ctx.browser} · ${ctx.installed ? "installed app" : "browser"} · ${ctx.width}px wide`,
    `- Sent: ${ctx.when}`,
    "",
    "_Sent from the in-app Coach. A scheduled Claude Code task applies owner feedback automatically, then replies here._"
  ].join("\n");
  const q = new URLSearchParams({ title, body, labels: LABEL });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

// Keep a local history so you can see what you've sent.
export function remember(text, url) {
  try {
    const list = JSON.parse(localStorage.getItem("allenamento.feedback") || "[]");
    list.unshift({ text, url, t: Date.now() });
    localStorage.setItem("allenamento.feedback", JSON.stringify(list.slice(0, 50)));
  } catch { /* storage blocked */ }
}
export function history() { try { return JSON.parse(localStorage.getItem("allenamento.feedback") || "[]"); } catch { return []; } }
