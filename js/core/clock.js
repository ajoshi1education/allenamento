// App clock. A debug offset (in days) lets us test "different days" rules without waiting.
import { DAY } from "./srs.js";

const KEY = "allenamento.debugDayOffset";
let offset = 0;
try { offset = Number(globalThis.localStorage?.getItem(KEY) || 0) || 0; } catch { offset = 0; }

export const now = () => Date.now() + offset * DAY;
export const getOffset = () => offset;
export function setOffset(days) {
  offset = Number(days) || 0;
  try { globalThis.localStorage?.setItem(KEY, String(offset)); } catch { /* storage blocked */ }
}
