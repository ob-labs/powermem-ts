import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../../src/utils/search.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('computes known values correctly', () => {
    // cos(45°) ≈ 0.707
    expect(cosineSimilarity([1, 0], [1, 1])).toBeCloseTo(1 / Math.sqrt(2), 3);
  });

  it('ranks vectors correctly', () => {
    const query = [1, 0, 0];
    const candidates = [
      { vec: [0, 1, 0], expected: 'orthogonal' },
      { vec: [1, 0, 0], expected: 'identical' },
      { vec: [0.9, 0.1, 0], expected: 'close' },
    ];

    const scores = candidates.map((c) => ({
      ...c,
      score: cosineSimilarity(query, c.vec),
    }));

    scores.sort((a, b) => b.score - a.score);
    expect(scores[0].expected).toBe('identical');
    expect(scores[1].expected).toBe('close');
    expect(scores[2].expected).toBe('orthogonal');
  });
});
