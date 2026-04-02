/**
 * Ebbinghaus forgetting curve — time-based memory decay.
 *
 * R = e^(-t * ln(2) / halfLife)
 * halfLife = baseHalfLife * (1 + log2(1 + accessCount))
 */

export interface DecayParams {
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  now?: Date;
}

export function computeDecayFactor(params: DecayParams): number {
  const now = params.now ?? new Date();
  const lastAccessed = new Date(params.updatedAt || params.createdAt);
  const elapsedHours = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);

  if (elapsedHours <= 0) return 1.0;

  const stability = 1.0 + Math.log2(1 + (params.accessCount ?? 0));
  const baseHalfLife = 24; // hours
  const effectiveHalfLife = baseHalfLife * stability;

  const decay = Math.exp((-elapsedHours * Math.LN2) / effectiveHalfLife);
  return Math.max(0, Math.min(1, decay));
}

/**
 * Blend cosine score with decay factor.
 * finalScore = cosine * (1 - weight) + cosine * decay * weight
 */
export function applyDecay(cosineScore: number, decayFactor: number, decayWeight = 0.3): number {
  return cosineScore * (1 - decayWeight) + cosineScore * decayFactor * decayWeight;
}
