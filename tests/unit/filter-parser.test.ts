import { describe, it, expect } from 'vitest';
import { parseAdvancedFilters } from '../../src/powermem/utils/filter-parser.js';

describe('parseAdvancedFilters', () => {
  it('returns undefined for empty/null', () => {
    expect(parseAdvancedFilters(undefined)).toBeUndefined();
    expect(parseAdvancedFilters({})).toBeUndefined();
  });

  it('maps start_time/end_time to created_at range', () => {
    const result = parseAdvancedFilters({
      start_time: '2024-01-01', end_time: '2024-12-31',
    });
    expect(result).toEqual({
      created_at: { $gte: '2024-01-01', $lte: '2024-12-31' },
    });
  });

  it('maps tags array to $in', () => {
    const result = parseAdvancedFilters({ tags: ['a', 'b'] });
    expect(result).toEqual({ tags: { $in: ['a', 'b'] } });
  });

  it('maps single tag as-is', () => {
    const result = parseAdvancedFilters({ tags: 'single' });
    expect(result).toEqual({ tags: 'single' });
  });

  it('maps type to category', () => {
    const result = parseAdvancedFilters({ type: 'preference' });
    expect(result).toEqual({ category: 'preference' });
  });

  it('maps importance number to $gte', () => {
    const result = parseAdvancedFilters({ importance: 0.7 });
    expect(result).toEqual({ importance: { $gte: 0.7 } });
  });

  it('handles multiple filters together', () => {
    const result = parseAdvancedFilters({
      start_time: '2024-01-01',
      type: 'todo',
      importance: 0.5,
      tags: ['work'],
    });
    expect(result).toEqual({
      created_at: { $gte: '2024-01-01' },
      category: 'todo',
      importance: { $gte: 0.5 },
      tags: { $in: ['work'] },
    });
  });

  it('preserves unknown fields', () => {
    const result = parseAdvancedFilters({ custom_field: 'value' });
    expect(result).toEqual({ custom_field: 'value' });
  });
});
