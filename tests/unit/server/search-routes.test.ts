/**
 * Unit tests for search routes (src/server/api/v1/search.ts).
 * Covers GET /memories/search and POST /memories/search.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerApp } from '../../../src/server/main.js';
import type { Memory } from '../../../src/powermem/core/memory.js';
import { MockEmbeddings } from '../../mocks.js';

let server: Server;
let memory: Memory;
let base = '';

beforeAll(async () => {
  const app = await createServerApp({
    dbPath: ':memory:',
    embeddings: new MockEmbeddings(),
  });
  memory = app.memory;
  server = app.app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/v1`;

  // Seed data for search tests
  for (const content of [
    'Alice works at Google as a software engineer',
    'Bob prefers dark roast coffee every morning',
    'Charlie lives in Tokyo and studies Japanese',
  ]) {
    await fetch(`${base}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, user_id: 'search-user', infer: false }),
    });
  }
});

afterAll(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await memory.close();
});

describe('GET /memories/search', () => {
  it('returns 400 when query parameter is missing', async () => {
    const res = await fetch(`${base}/memories/search`);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('query');
  });

  it('searches with query parameter', async () => {
    const res = await fetch(`${base}/memories/search?query=software+engineer`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.results).toBeDefined();
    expect(json.data.results.length).toBeGreaterThan(0);
  });

  it('searches with q alias parameter', async () => {
    const res = await fetch(`${base}/memories/search?q=coffee`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.results).toBeDefined();
  });

  it('filters by user_id', async () => {
    const res = await fetch(
      `${base}/memories/search?query=coffee&user_id=search-user`,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('filters by user_id with no results for unknown user', async () => {
    const res = await fetch(
      `${base}/memories/search?query=coffee&user_id=nonexistent-user`,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.results).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    const res = await fetch(
      `${base}/memories/search?query=a&user_id=search-user&limit=1`,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.results.length).toBeLessThanOrEqual(1);
  });
});

describe('POST /memories/search', () => {
  it('searches with body query', async () => {
    const res = await fetch(`${base}/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Tokyo Japanese', limit: 5 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.results).toBeDefined();
  });

  it('filters by user_id and agent_id', async () => {
    const res = await fetch(`${base}/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'coffee',
        user_id: 'search-user',
        agent_id: 'test-agent',
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('supports threshold parameter', async () => {
    const res = await fetch(`${base}/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'coffee',
        user_id: 'search-user',
        threshold: 0.99,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns message field on success', async () => {
    const res = await fetch(`${base}/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    const json = await res.json();
    expect(json.message).toBe('Search completed successfully');
  });
});
