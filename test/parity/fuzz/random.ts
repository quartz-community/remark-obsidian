/**
 * A deterministic generator, so a failure is a number someone can re-run.
 *
 * `Math.random` would make a fuzz failure a screenshot rather than a bug
 * report. mulberry32 is small, has no dependencies and gives the same stream
 * for the same seed on every machine and every Node version, which is the
 * only property that matters here: the seed *is* the reproduction.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, bound). */
  int(bound: number): number {
    return Math.floor(this.next() * bound);
  }

  /** Integer in [low, high], inclusive. */
  between(low: number, high: number): number {
    return low + this.int(high - low + 1);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** `count` picks, which may repeat. */
  sample<T>(items: readonly T[], count: number): T[] {
    return Array.from({ length: count }, () => this.pick(items));
  }
}
