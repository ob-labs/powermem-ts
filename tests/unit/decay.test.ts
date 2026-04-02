import { describe, it, expect } from 'vitest';
import { computeDecayFactor, applyDecay } from '../../src/intelligence/ebbinghaus.js';

describe('computeDecayFactor', () => {
  const now = new Date('2026-04-01T12:00:00Z');

  it('returns 1.0 for a memory just updated', () => {
    expect(computeDecayFactor({
      createdAt: '2026-04-01T12:00:00Z',
      updatedAt: '2026-04-01T12:00:00Z',
      accessCount: 0,
      now,
    })).toBeCloseTo(1.0, 3);
  });

  it('decays over time', () => {
    const factor24h = computeDecayFactor({
      createdAt: '2026-03-31T12:00:00Z',
      updatedAt: '2026-03-31T12:00:00Z',
      accessCount: 0,
      now,
    });
    // 24 hours elapsed, base half-life = 24h, stability = 1.0 → factor ≈ 0.5
    expect(factor24h).toBeCloseTo(0.5, 1);
  });

  it('higher access count decays slower', () => {
    const lowAccess = computeDecayFactor({
      createdAt: '2026-03-30T12:00:00Z',
      updatedAt: '2026-03-30T12:00:00Z',
      accessCount: 0,
      now,
    });
    const highAccess = computeDecayFactor({
      createdAt: '2026-03-30T12:00:00Z',
      updatedAt: '2026-03-30T12:00:00Z',
      accessCount: 10,
      now,
    });
    expect(highAccess).toBeGreaterThan(lowAccess);
  });

  it('returns between 0 and 1', () => {
    const factor = computeDecayFactor({
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
      accessCount: 0,
      now,
    });
    expect(factor).toBeGreaterThanOrEqual(0);
    expect(factor).toBeLessThanOrEqual(1);
  });
});

describe('applyDecay', () => {
  it('no decay → score unchanged', () => {
    expect(applyDecay(0.8, 1.0, 0.3)).toBeCloseTo(0.8, 5);
  });

  it('full decay reduces score', () => {
    const result = applyDecay(0.8, 0.0, 0.3);
    // 0.8 * 0.7 + 0.8 * 0.0 * 0.3 = 0.56
    expect(result).toBeCloseTo(0.56, 3);
  });

  it('weight=0 means no decay effect', () => {
    expect(applyDecay(0.8, 0.0, 0.0)).toBeCloseTo(0.8, 5);
  });

  it('weight=1 means full decay effect', () => {
    expect(applyDecay(0.8, 0.5, 1.0)).toBeCloseTo(0.4, 3);
  });
});
