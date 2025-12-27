// Deterministic RNG for consistent testing
export class RNG {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  // Mulberry32 algorithm
  next(): number {
    this.seed |= 0;
    this.seed = this.seed + 0x6d2b79f5 | 0;
    let t = Math.imul(this.seed ^ this.seed >>> 15, 1 | this.seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // Random float between 0 and 1
  random(): number {
    return this.next();
  }

  // Random integer between min and max (inclusive)
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  // Random boolean with given probability
  randomBool(probability: number = 0.5): boolean {
    return this.random() < probability;
  }

  // Set new seed
  setSeed(seed: number): void {
    this.seed = seed;
  }

  // Get current seed
  getSeed(): number {
    return this.seed;
  }
}

// Global RNG instance
export const rng = new RNG();
