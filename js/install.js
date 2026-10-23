// "Install the app": Chrome/Edge/Android offer a real install prompt; iPhone/iPad need Share → Add to Home Screen.
let deferred = null;
const listeners = new Set();
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()); });
window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach(f => f()); });

export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferred;
export const onChange = f => (listeners.add(f), () => listeners.delete(f));

export async function install() {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; listeners.forEach(f => f());
    return outcome;                       // "accepted" | "dismissed"
  }
  return isIOS() ? "ios" : "unavailable";
}

export const HOWTO = {
  ios: "On iPhone/iPad: open this site in <b>Safari</b>, tap the <b>Share</b> button (square with an arrow), then <b>Add to Home Screen</b>.",
  android: "On Android: open this site in <b>Chrome</b>, tap the <b>⋮</b> menu, then <b>Install app</b> (or <b>Add to Home screen</b>).",
  desktop: "On a computer: in Chrome or Edge, click the <b>install icon</b> at the right end of the address bar (a monitor with an arrow)."
};
