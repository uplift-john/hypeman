/**
 * Cheap activity detector: compare two tiny greyscale thumbnails.
 * A frame counts as "changed" when enough pixels moved by a visible amount —
 * robust to compression noise, sensitive enough to notice typing or scrolling.
 */
// 160×90: on a 1920px screen each thumb pixel covers ~12×12 px, so typing a single word
// changes several thumb pixels clearly, while a blinking caret barely moves one.
export const THUMB_W = 160;
export const THUMB_H = 90;
export const PIXEL_DELTA = 8;
export const CHANGED_FRACTION = 0.0005; // ≈ 7 of 14 400 pixels

export function lumaDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): { changedFraction: number; active: boolean } {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { changedFraction: 0, active: false };
  let changed = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > PIXEL_DELTA) changed++;
  const changedFraction = changed / n;
  return { changedFraction, active: changedFraction >= CHANGED_FRACTION };
}

/** RGBA → luma (Rec. 601), one byte per pixel. */
export function toLuma(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}
