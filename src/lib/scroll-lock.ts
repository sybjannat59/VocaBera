/**
 * Reference-counted body scroll lock.
 *
 * Several overlays (word sheet, daily recap, dialogs…) can be open at once and close in any
 * order. Saving/restoring `overflow` per overlay can leave the page permanently unscrollable,
 * so every lock is counted and the page is only unlocked when the last overlay closes.
 */
let locks = 0;
let saved = "";

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = saved === "hidden" ? "" : saved;
  };
}

/** Emergency reset (used when the app recovers from an error). */
export function resetScrollLock() {
  locks = 0;
  if (typeof document !== "undefined") document.body.style.overflow = "";
}
