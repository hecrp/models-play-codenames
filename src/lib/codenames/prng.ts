/**
 * Small, dependency-free deterministic PRNG. The whole game (words, colors
 * and the starting team) must be reproducible from a single seed.
 */

export function hashSeed(seed: number): number {
  const value = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash;
}

export function createRng(seed: number): () => number {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomInt(rng: () => number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(rng() * maxExclusive);
}

/** Fisher-Yates on a copy, so callers never mutate the source array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(rng, index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % 2_147_483_647;
  }
  return Math.floor(Math.random() * 2_147_483_647);
}
