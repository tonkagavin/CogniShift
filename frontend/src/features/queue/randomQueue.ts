import type { QueueEntry } from "./recommender";

type PRNG = {
  next: () => number; // 0..1
};

function seededPrngFromCrypto(): PRNG {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 0x12345678;
  let x = seed >>> 0;
  // xorshift32
  return {
    next: () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x / 2 ** 32;
    },
  };
}

function randomInt(prng: PRNG, maxExclusive: number): number {
  return Math.floor(prng.next() * maxExclusive);
}

export function buildRandomShadowQueue({
  candidates,
  limit = 5,
}: {
  candidates: Array<{ trackId: string; trackName: string }>;
  limit?: number;
}): QueueEntry[] {
  if (candidates.length === 0) return [];
  const prng = seededPrngFromCrypto();
  const chosen = new Set<number>();
  const out: QueueEntry[] = [];
  while (out.length < limit && chosen.size < candidates.length) {
    const idx = randomInt(prng, candidates.length);
    if (chosen.has(idx)) continue;
    chosen.add(idx);
    const c = candidates[idx];
    out.push({
      trackId: c.trackId,
      trackName: c.trackName,
      source: "random",
      predictedAlignment: 0,
    });
  }
  return out;
}

