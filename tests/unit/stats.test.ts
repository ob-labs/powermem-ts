import { describe, it, expect } from 'vitest';
import { calculateStatsFromMemories } from '../../src/powermem/utils/stats.js';

describe('calculateStatsFromMemories', () => {
  it('returns zeros for empty array', () => {
    const stats = calculateStatsFromMemories([]);
    expect(stats.totalMemories).toBe(0);
    expect(stats.byType).toEqual({});
    expect(stats.avgImportance).toBe(0);
    expect(stats.topAccessed).toEqual([]);
    expect(stats.growthTrend).toEqual({});
    expect(stats.ageDistribution['< 1 day']).toBe(0);
  });

  it('counts total memories', () => {
    const memories = [
      { id: '1', content: 'a' },
      { id: '2', content: 'b' },
      { id: '3', content: 'c' },
    ];
    expect(calculateStatsFromMemories(memories).totalMemories).toBe(3);
  });

  it('groups by category', () => {
    const memories = [
      { id: '1', category: 'todo' },
      { id: '2', category: 'preference' },
      { id: '3', category: 'todo' },
    ];
    const stats = calculateStatsFromMemories(memories);
    expect(stats.byType).toEqual({ todo: 2, preference: 1 });
  });

  it('defaults category to unknown', () => {
    const memories = [{ id: '1' }];
    expect(calculateStatsFromMemories(memories).byType).toEqual({ unknown: 1 });
  });

  it('calculates avg importance', () => {
    const memories = [
      { id: '1', importance: 0.8 },
      { id: '2', importance: 0.6 },
    ];
    expect(calculateStatsFromMemories(memories).avgImportance).toBe(0.7);
  });

  it('ranks by access count', () => {
    const memories = [
      { id: '1', content: 'low', accessCount: 1 },
      { id: '2', content: 'high', accessCount: 100 },
      { id: '3', content: 'mid', accessCount: 10 },
    ];
    const stats = calculateStatsFromMemories(memories);
    expect(stats.topAccessed[0].id).toBe('2');
    expect(stats.topAccessed[0].accessCount).toBe(100);
  });

  it('computes growth trend by date', () => {
    const today = new Date().toISOString().split('T')[0];
    const memories = [
      { id: '1', createdAt: new Date().toISOString() },
      { id: '2', createdAt: new Date().toISOString() },
    ];
    const stats = calculateStatsFromMemories(memories);
    expect(stats.growthTrend[today]).toBe(2);
  });

  it('computes age distribution', () => {
    const now = Date.now();
    const memories = [
      { id: '1', createdAt: new Date(now).toISOString() },                           // < 1 day
      { id: '2', createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() }, // 1-7 days
      { id: '3', createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString() }, // 7-30 days
      { id: '4', createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString() }, // > 30 days
    ];
    const stats = calculateStatsFromMemories(memories);
    expect(stats.ageDistribution['< 1 day']).toBe(1);
    expect(stats.ageDistribution['1-7 days']).toBe(1);
    expect(stats.ageDistribution['7-30 days']).toBe(1);
    expect(stats.ageDistribution['> 30 days']).toBe(1);
  });

  it('truncates content to 100 chars in topAccessed', () => {
    const longContent = 'a'.repeat(200);
    const memories = [{ id: '1', content: longContent, accessCount: 5 }];
    const stats = calculateStatsFromMemories(memories);
    expect(stats.topAccessed[0].content.length).toBe(100);
  });
});
