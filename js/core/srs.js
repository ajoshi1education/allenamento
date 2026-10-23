// Spaced repetition (SM-2 style), used for vocabulary cards and concept retests.
export const MIN = 60e3, DAY = 864e5;

export function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function newCard(now) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, lastReview: null };
}

// grade: 0 = forgot, 3 = hard but right, 4 = good, 5 = easy
export function review(card, grade, now) {
  const c = { ...newCard(now), ...card, lastReview: now };
  if (grade < 3) {
    c.reps = 0;
    c.lapses += 1;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * MIN;          // see it again later in the session
  } else {
    c.reps += 1;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.interval * c.ease);
    if (grade === 3) c.interval = Math.max(1, Math.round(c.interval * 0.8));
    c.ease = Math.max(1.3, c.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    c.due = now + c.interval * DAY;
  }
  return c;
}

export const isDue = (card, now) => !card.due || card.due <= now;
