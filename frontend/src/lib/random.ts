/**
 * Deterministic pseudo-random number in [0, 1) for a given key.
 * Demo data built with this looks random but is identical on every load.
 */
export function seededRandom(key: string): number {
  // FNV-1a hash → mulberry32 step
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Deterministic integer in [min, max] for a given key. */
export function seededInt(key: string, min: number, max: number): number {
  return min + Math.floor(seededRandom(key) * (max - min + 1));
}
