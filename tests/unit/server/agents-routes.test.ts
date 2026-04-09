/**
 * Unit tests for agent routes (src/server/api/v1/agents.ts).
 * Covers agent memory CRUD and memory sharing between agents.
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

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

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
});

afterAll(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await memory.close();
});

// ─── Agent memories ───────────────────────────────────────────

describe('POST /agents/:agentId/memories', () => {
  it('creates a memory for an agent', async () => {
    const { status, data } = await api('/agents/agent-1/memories', {
      method: 'POST',
      body: JSON.stringify({
        content: 'Agent 1 learned about user preferences',
        user_id: 'agent-user-1',
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('creates memory with metadata', async () => {
    const { status, data } = await api('/agents/agent-1/memories', {
      method: 'POST',
      body: JSON.stringify({
        content: 'Agent memory with meta',
        metadata: { tool: 'calculator', confidence: 0.9 },
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('defaults infer to false', async () => {
    const { status, data } = await api('/agents/agent-1/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'no infer specified' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('GET /agents/:agentId/memories', () => {
  it('lists memories for an agent', async () => {
    const { status, data } = await api('/agents/agent-1/memories');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.memories).toBeDefined();
    expect(Array.isArray(data.data.memories)).toBe(true);
    expect(data.data.memories.length).toBeGreaterThan(0);
  });

  it('respects limit parameter', async () => {
    const { data } = await api('/agents/agent-1/memories?limit=1');
    expect(data.data.memories.length).toBeLessThanOrEqual(1);
  });

  it('supports offset parameter', async () => {
    const { data: all } = await api('/agents/agent-1/memories?limit=100');
    if (all.data.memories.length > 1) {
      const { data: page } = await api('/agents/agent-1/memories?limit=1&offset=1');
      expect(page.data.memories.length).toBeLessThanOrEqual(1);
      const firstAllId = all.data.memories[0].memoryId ?? all.data.memories[0].id;
      const firstPageId = page.data.memories[0]?.memoryId ?? page.data.memories[0]?.id;
      expect(firstPageId).not.toBe(firstAllId);
    }
  });

  it('returns empty for unknown agent', async () => {
    const { data } = await api('/agents/nonexistent-agent/memories');
    expect(data.data.memories).toHaveLength(0);
  });
});

// ─── Share ────────────────────────────────────────────────────

describe('POST /agents/:agentId/memories/share', () => {
  it('shares memories from one agent to another', async () => {
    // Create a memory for agent-share-src
    const created = await api('/agents/agent-share-src/memories', {
      method: 'POST',
      body: JSON.stringify({
        content: 'Shareable knowledge',
        infer: false,
      }),
    });
    expect(created.status).toBe(200);

    // Get the created memory ID
    const listRes = await api('/agents/agent-share-src/memories');
    const memories = listRes.data.data.memories;
    const memId = memories[0]?.memoryId ?? memories[0]?.id;

    const { status, data } = await api('/agents/agent-share-src/memories/share', {
      method: 'POST',
      body: JSON.stringify({
        memory_ids: [memId],
        target_agent_id: 'agent-share-dst',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.shared_count).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 shared for nonexistent memory ids', async () => {
    const { status, data } = await api('/agents/agent-x/memories/share', {
      method: 'POST',
      body: JSON.stringify({
        memory_ids: ['fake-id-abc'],
        target_agent_id: 'agent-y',
      }),
    });
    expect(status).toBe(200);
    expect(data.data.shared_count).toBe(0);
  });
});

describe('GET /agents/:agentId/memories/share', () => {
  it('lists shared memories for an agent', async () => {
    // agent-share-dst should have shared memories from previous test
    const { status, data } = await api('/agents/agent-share-dst/memories/share');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.memories)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const { data } = await api('/agents/agent-share-dst/memories/share?limit=1');
    expect(data.success).toBe(true);
    expect(data.data.memories.length).toBeLessThanOrEqual(1);
  });

  it('returns empty for agent with no shared memories', async () => {
    const { data } = await api('/agents/no-share-agent/memories/share');
    expect(data.data.memories).toHaveLength(0);
  });
});
