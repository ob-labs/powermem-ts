/**
 * IntelligenceManager tests.
 */
import { describe, it, expect } from 'vitest';
import { IntelligenceManager } from '../../../src/powermem/intelligence/manager.js';

describe('IntelligenceManager', () => {
  it('disabled manager returns metadata unchanged', () => {
    const mgr = new IntelligenceManager({ enabled: false });
    const result = mgr.processMetadata('test', { key: 'value' });
    expect(result).toEqual({ key: 'value' });
  });

  it('enabled manager adds importance to metadata', () => {
    const mgr = new IntelligenceManager({ enabled: true });
    const result = mgr.processMetadata('This is important and critical!', {});
    expect(result.importance).toBeDefined();
    expect(typeof result.importance).toBe('number');
    expect(result.importance as number).toBeGreaterThan(0);
  });

  it('processSearchResults with decay disabled returns unchanged', () => {
    const mgr = new IntelligenceManager({ enabled: true, enableDecay: false });
    const results = [
      { id: '1', content: 'a', score: 0.9 },
      { id: '2', content: 'b', score: 0.8 },
    ];
    const processed = mgr.processSearchResults(results);
    expect(processed[0].score).toBe(0.9);
    expect(processed[1].score).toBe(0.8);
  });

  it('processSearchResults with decay enabled adjusts scores', () => {
    const mgr = new IntelligenceManager({ enabled: true, enableDecay: true, decayWeight: 0.5 });
    const results = [
      {
        id: '1', content: 'recent', score: 0.9,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 10,
      },
      {
        id: '2', content: 'old', score: 0.9,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        accessCount: 0,
      },
    ];
    const processed = mgr.processSearchResults(results);
    // Recent + frequently accessed should rank higher than old + never accessed
    expect(processed[0].id).toBe('1');
    expect(processed[0].score).toBeGreaterThan(processed[1].score);
  });
});
