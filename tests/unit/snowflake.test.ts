import { describe, it, expect } from 'vitest';
import { SnowflakeIDGenerator } from '../../src/utils/snowflake.js';
import { PowerMemError } from '../../src/errors/index.js';

describe('SnowflakeIDGenerator', () => {
  describe('constructor validation', () => {
    it('rejects negative datacenterId', () => {
      expect(() => new SnowflakeIDGenerator(-1, 0)).toThrow(PowerMemError);
    });

    it('rejects datacenterId exceeding 31', () => {
      expect(() => new SnowflakeIDGenerator(32, 0)).toThrow(PowerMemError);
    });

    it('rejects negative workerId', () => {
      expect(() => new SnowflakeIDGenerator(0, -1)).toThrow(PowerMemError);
    });

    it('rejects workerId exceeding 31', () => {
      expect(() => new SnowflakeIDGenerator(0, 32)).toThrow(PowerMemError);
    });

    it('accepts valid datacenterId and workerId at boundary', () => {
      expect(() => new SnowflakeIDGenerator(31, 31)).not.toThrow();
    });
  });

  it('generates unique IDs', () => {
    const gen = new SnowflakeIDGenerator();
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(gen.nextId());
    }
    expect(ids.size).toBe(10_000);
  });

  it('generates monotonically increasing IDs', () => {
    const gen = new SnowflakeIDGenerator();
    let prev = BigInt(gen.nextId());
    for (let i = 0; i < 1_000; i++) {
      const curr = BigInt(gen.nextId());
      expect(curr).toBeGreaterThan(prev);
      prev = curr;
    }
  });

  it('returns string format', () => {
    const gen = new SnowflakeIDGenerator();
    const id = gen.nextId();
    expect(typeof id).toBe('string');
    expect(() => BigInt(id)).not.toThrow();
  });

  it('handles rapid generation without duplicates', () => {
    const gen = new SnowflakeIDGenerator();
    // Generate more than 4096 (max sequence per ms) to force ms rollover
    const ids = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      ids.add(gen.nextId());
    }
    expect(ids.size).toBe(5_000);
  });
});
