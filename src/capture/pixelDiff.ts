/**
 * Cheap activity detector: compare two tiny greyscale thumbnails.
 * A frame counts as "changed" when enough pixels moved by a visible amount —
 * robust to compression noise, sensitive enough to notice typing or scrolling.
 */
export const THUMB_W = 64;
export const THUMB_H = 36;
export const PIXEL_DELTA = 10;
export const CHANGED_FRACTION = 0.004; // ≈ 9 of 2304 pixels

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
