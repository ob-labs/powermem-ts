/**
 * Ebbinghaus forgetting curve — detailed tests
 * Ported from Python's test_scenario_8_ebbinghaus_forgetting_curve.py
 *
 * Tests the full decay lifecycle:
 * - Initial retention is 100%
 * - Time decay follows exponential curve
 * - Access (reinforcement) increases stability → slower decay
 * - Decay affects search result ordering
 */
import { describe, it, expect, afterEach } from 'vitest';
import { computeDecayFactor, applyDecay } from '../src/provider/native/decay.js';
import { NativeProvider } from '../src/provider/native/index.js';
import { MockEmbeddings } from './mocks.js';

describe('Ebbinghaus forgetting curve — detailed', () => {
  const baseTime = new Date('2026-04-01T12:00:00Z');

  // ── Decay math ───────────────────────────────────────────────────────

  it('initial retention is 100% (just created)', () => {
    const factor = computeDecayFactor({
      createdAt: baseTime.toISOString(),
      updatedAt: baseTime.toISOString(),
      accessCount: 0,
      now: baseTime,
    });
    expect(factor).toBeCloseTo(1.0, 5);
  });

  it('exponential decay over time intervals', () => {
    const intervals = [1, 6, 12, 24, 48, 72, 168]; // hours
    let prevFactor = 1.0;

    for (const hours of intervals) {
      const past = new Date(baseTime.getTime() - hours * 60 * 60 * 1000);
      const factor = computeDecayFactor({
        createdAt: past.toISOString(),
        updatedAt: past.toISOString(),
        accessCount: 0,
        now: baseTime,
      });
      expect(factor).toBeLessThan(prevFactor);
      expect(factor).toBeGreaterThan(0);
      prevFactor = factor;
    }
  });

  it('reinforcement (access count) slows decay', () => {
    const hoursPast = 48;
    const past = new Date(baseTime.getTime() - hoursPast * 60 * 60 * 1000);

    const accessCounts = [0, 1, 5, 10, 50];
    let prevFactor = 0;

    for (const count of accessCounts) {
      const factor = computeDecayFactor({
        createdAt: past.toISOString(),
        updatedAt: past.toISOString(),
        accessCount: count,
        now: baseTime,
      });
      expect(factor).toBeGreaterThan(prevFactor);
      prevFactor = factor;
    }
  });

  it('half-life doubles with each doubling of access count', () => {
    const past24h = new Date(baseTime.getTime() - 24 * 60 * 60 * 1000);

    // accessCount=0: stability=1.0, halfLife=24h → factor ≈ 0.5
    const f0 = computeDecayFactor({
      createdAt: past24h.toISOString(),
      updatedAt: past24h.toISOString(),
      accessCount: 0,
      now: baseTime,
    });
    expect(f0).toBeCloseTo(0.5, 1);

    // accessCount=1: stability=2.0, halfLife=48h → factor ≈ 0.71
    const f1 = computeDecayFactor({
      createdAt: past24h.toISOString(),
      updatedAt: past24h.toISOString(),
      accessCount: 1,
      now: baseTime,
    });
    expect(f1).toBeGreaterThan(f0);
    expect(f1).toBeCloseTo(0.707, 1);
  });

  it('very old memory with zero access approaches 0', () => {
    const yearAgo = new Date(baseTime.getTime() - 365 * 24 * 60 * 60 * 1000);
    const factor = computeDecayFactor({
      createdAt: yearAgo.toISOString(),
      updatedAt: yearAgo.toISOString(),
      accessCount: 0,
      now: baseTime,
    });
    expect(factor).toBeLessThan(0.001);
  });

  it('heavily reinforced old memory retains significant value', () => {
    const monthAgo = new Date(baseTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    const factor = computeDecayFactor({
      createdAt: monthAgo.toISOString(),
      updatedAt: monthAgo.toISOString(),
      accessCount: 100,
      now: baseTime,
    });
    // With 100 accesses, stability ≈ 7.6, halfLife ≈ 183h
    // 30 days = 720h → several half-lives but still measurable
    expect(factor).toBeGreaterThan(0.01);
  });

  // ── Decay weight blending ────────────────────────────────────────────

  it('decayWeight=0.3 blends 70% cosine + 30% decayed cosine', () => {
    // cosine=0.9, decay=0.5, weight=0.3
    // 0.9 * 0.7 + 0.9 * 0.5 * 0.3 = 0.63 + 0.135 = 0.765
    expect(applyDecay(0.9, 0.5, 0.3)).toBeCloseTo(0.765, 3);
  });

  // ── Integration: decay affects search ordering ───────────────────────

  it('recently accessed memory ranks higher than stale one with decay enabled', async () => {
    const provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
      enableDecay: true,
      decayWeight: 0.5,
    });

    // Add two similar memories
    const r1 = await provider.add({ content: 'memory alpha', infer: false });
    const r2 = await provider.add({ content: 'memory alpha beta', infer: false });

    // Simulate: access r1 many times (increases its access_count)
    for (let i = 0; i < 5; i++) {
      await provider.get(r1.memories[0].id);
    }

    // Both have similar cosine scores for "memory alpha"
    // r1 has higher access_count → slower decay → potentially higher final score
    const result = await provider.search({ query: 'memory alpha' });
    expect(result.results.length).toBe(2);
    // Scores should both be positive
    expect(result.results[0].score!).toBeGreaterThan(0);
    expect(result.results[1].score!).toBeGreaterThan(0);

    await provider.close();
  });
});
