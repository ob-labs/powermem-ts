import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../../src/storage/sqlite/sqlite.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('SQLiteStore hybrid search', () => {
  let store: SQLiteStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-'));
    store = new SQLiteStore(path.join(tmpDir, 'test.db'));

    // Insert test documents with mock vectors
    const now = new Date().toISOString();
    await store.insert('d1', [1, 0, 0], { data: 'TypeScript programming language tutorial', user_id: 'u1', created_at: now, updated_at: now, metadata: {} });
    await store.insert('d2', [0, 1, 0], { data: 'Python machine learning guide', user_id: 'u1', created_at: now, updated_at: now, metadata: {} });
    await store.insert('d3', [0, 0, 1], { data: 'The quick brown fox jumps over the lazy dog', user_id: 'u1', created_at: now, updated_at: now, metadata: {} });
    await store.insert('d4', [0.5, 0.5, 0], { data: 'JavaScript React framework', user_id: 'u1', created_at: now, updated_at: now, metadata: {} });
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hybridSearch returns results', async () => {
    const results = await store.hybridSearch([1, 0, 0], 'TypeScript', {}, 4);
    expect(results.length).toBeGreaterThan(0);
  });

  it('hybridSearch combines vector and text scores', async () => {
    // Query vector is closest to d1, query text matches d1 too
    const results = await store.hybridSearch([1, 0, 0], 'TypeScript programming', {}, 4);
    expect(results[0].id).toBe('d1');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('hybridSearch respects filters', async () => {
    const results = await store.hybridSearch([1, 0, 0], 'TypeScript', { userId: 'u1' }, 4);
    expect(results.length).toBeGreaterThan(0);

    const noResults = await store.hybridSearch([1, 0, 0], 'TypeScript', { userId: 'nonexistent' }, 4);
    expect(noResults).toHaveLength(0);
  });

  it('hybridSearch falls back to vector-only when no text query', async () => {
    const results = await store.hybridSearch([1, 0, 0], '', {}, 4);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('d1'); // closest vector
  });

  it('hybridSearch with custom weights', async () => {
    // All text weight — should favor text match
    const textHeavy = await store.hybridSearch([0, 1, 0], 'TypeScript', {}, 4, 0.0, 1.0);
    // The text match for "TypeScript" is d1
    const hasTypescript = textHeavy.some(r => r.content.includes('TypeScript'));
    expect(hasTypescript).toBe(true);
  });

  it('FTS table is populated on insert', async () => {
    // Add a new doc and verify FTS finds it
    await store.insert('d5', [0, 0, 0], { data: 'unique keyword xyzzy', user_id: 'u1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: {} });
    const results = await store.hybridSearch([0, 0, 0], 'xyzzy', {}, 4);
    expect(results.some(r => r.content.includes('xyzzy'))).toBe(true);
  });

  it('FTS table stays in sync on update', async () => {
    await store.update('d1', [1, 0, 0], { data: 'Rust systems programming', user_id: 'u1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: {} });
    const results = await store.hybridSearch([1, 0, 0], 'Rust', {}, 4);
    expect(results.some(r => r.content.includes('Rust'))).toBe(true);
    // Old content should not match
    const old = await store.hybridSearch([0, 0, 0], 'TypeScript tutorial', {}, 4);
    expect(old.every(r => !r.content.includes('TypeScript tutorial'))).toBe(true);
  });

  it('FTS table stays in sync on remove', async () => {
    await store.remove('d1');
    const results = await store.hybridSearch([1, 0, 0], 'TypeScript', {}, 4);
    expect(results.every(r => r.id !== 'd1')).toBe(true);
  });
});
