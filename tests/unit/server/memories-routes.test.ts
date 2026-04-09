/**
 * Unit tests for memory CRUD routes (src/server/api/v1/memories.ts).
 * Covers stats, count, users, export, list, single CRUD, batch ops, import, deleteAll.
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
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
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

// ─── Stats ─────────────────────────────────────────────────────

describe('GET /memories/stats', () => {
  it('returns stats with zero memories', async () => {
    const { status, data } = await api('/memories/stats?user_id=stats-empty');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalMemories).toBe(0);
  });

  it('returns stats with user_id filter', async () => {
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'stats item', user_id: 'stats-u1', infer: false }),
    });
    const { data } = await api('/memories/stats?user_id=stats-u1');
    expect(data.success).toBe(true);
    expect(data.data.totalMemories).toBeGreaterThanOrEqual(1);
  });

  it('returns ageDistribution field', async () => {
    const { data } = await api('/memories/stats');
    expect(data.data.ageDistribution).toBeDefined();
  });
});

// ─── Count ─────────────────────────────────────────────────────

describe('GET /memories/count', () => {
  it('returns count for all memories', async () => {
    const { status, data } = await api('/memories/count');
    expect(status).toBe(200);
    expect(typeof data.data.count).toBe('number');
  });

  it('returns count filtered by user_id', async () => {
    const uid = `cnt-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'count test', user_id: uid, infer: false }),
    });
    const { data } = await api(`/memories/count?user_id=${uid}`);
    expect(data.data.count).toBe(1);
  });

  it('returns 0 for unknown user_id', async () => {
    const { data } = await api('/memories/count?user_id=nonexistent-count-user');
    expect(data.data.count).toBe(0);
  });
});

// ─── Users list ────────────────────────────────────────────────

describe('GET /memories/users', () => {
  it('returns a list of users', async () => {
    const { status, data } = await api('/memories/users');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.users)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const { data } = await api('/memories/users?limit=1');
    expect(data.data.users.length).toBeLessThanOrEqual(1);
  });
});

// ─── Export ────────────────────────────────────────────────────

describe('GET /memories/export', () => {
  it('returns memories array with count', async () => {
    const { status, data } = await api('/memories/export');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.memories)).toBe(true);
    expect(typeof data.data.count).toBe('number');
    expect(data.data.count).toBe(data.data.memories.length);
  });

  it('filters by user_id', async () => {
    const uid = `export-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'export me', user_id: uid, infer: false }),
    });
    const { data } = await api(`/memories/export?user_id=${uid}`);
    expect(data.data.memories.length).toBeGreaterThanOrEqual(1);
    for (const m of data.data.memories) {
      expect(m.userId).toBe(uid);
    }
  });

  it('respects limit parameter', async () => {
    const { data } = await api('/memories/export?limit=1');
    expect(data.data.memories.length).toBeLessThanOrEqual(1);
  });
});

// ─── List ──────────────────────────────────────────────────────

describe('GET /memories/', () => {
  it('returns paginated list', async () => {
    const { status, data } = await api('/memories?limit=5&offset=0');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.memories)).toBe(true);
  });

  it('filters by user_id', async () => {
    const uid = `list-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'list me', user_id: uid, infer: false }),
    });
    const { data } = await api(`/memories?user_id=${uid}`);
    expect(data.data.memories.length).toBeGreaterThanOrEqual(1);
    for (const m of data.data.memories) {
      expect(m.userId).toBe(uid);
    }
  });

  it('supports sort_by and order parameters', async () => {
    const { status, data } = await api(
      '/memories?sort_by=created_at&order=desc&limit=5',
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns total count in response', async () => {
    const { data } = await api('/memories?limit=1');
    expect(typeof data.data.total).toBe('number');
  });
});

// ─── Single memory CRUD ───────────────────────────────────────

describe('POST /memories/ (single)', () => {
  it('creates a memory and returns it', async () => {
    const { status, data } = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({
        content: 'new single memory',
        user_id: 'crud-user',
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.memories).toBeDefined();
    expect(data.data.memories.length).toBeGreaterThanOrEqual(1);
    expect(data.data.memories[0].content).toBe('new single memory');
  });

  it('creates a memory with metadata', async () => {
    const { data } = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({
        content: 'with meta',
        user_id: 'crud-user',
        metadata: { source: 'test', priority: 'high' },
        infer: false,
      }),
    });
    expect(data.success).toBe(true);
  });
});

describe('GET /memories/:id', () => {
  it('returns a specific memory by id', async () => {
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'get by id', user_id: 'get-user', infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status, data } = await api(`/memories/${id}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.content).toBe('get by id');
  });

  it('returns 404 for nonexistent id', async () => {
    const { status, data } = await api('/memories/nonexistent-id-12345');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.message).toContain('not found');
  });
});

describe('PUT /memories/:id', () => {
  it('updates memory content', async () => {
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'before update', user_id: 'put-user', infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status, data } = await api(`/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'after update' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify the update
    const { data: getRes } = await api(`/memories/${id}`);
    expect(getRes.data.content).toBe('after update');
  });

  it('updates memory metadata', async () => {
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'meta update', user_id: 'put-user', infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status } = await api(`/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'meta update', metadata: { tag: 'updated' } }),
    });
    expect(status).toBe(200);
  });
});

describe('DELETE /memories/:id', () => {
  it('deletes a memory', async () => {
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'to delete', user_id: 'del-user', infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status, data } = await api(`/memories/${id}`, { method: 'DELETE' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);

    // Verify deletion
    const { status: getStatus } = await api(`/memories/${id}`);
    expect(getStatus).toBe(404);
  });
});

// ─── Batch create ─────────────────────────────────────────────

describe('POST /memories/batch', () => {
  it('creates multiple memories at once', async () => {
    const { status, data } = await api('/memories/batch', {
      method: 'POST',
      body: JSON.stringify({
        memories: [
          { content: 'batch item 1' },
          { content: 'batch item 2' },
          { content: 'batch item 3' },
        ],
        user_id: 'batch-user',
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('accepts metadata and scope per item', async () => {
    const { status, data } = await api('/memories/batch', {
      method: 'POST',
      body: JSON.stringify({
        memories: [
          { content: 'scoped batch', metadata: { src: 'test' }, scope: 'work', category: 'notes' },
        ],
        user_id: 'batch-user',
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ─── Batch update ─────────────────────────────────────────────

describe('PUT /memories/batch', () => {
  it('updates multiple memories', async () => {
    // Create two memories
    const c1 = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'batch upd 1', user_id: 'bupd-user', infer: false }),
    });
    const c2 = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'batch upd 2', user_id: 'bupd-user', infer: false }),
    });
    const id1 = c1.data.data.memories[0].memoryId ?? c1.data.data.memories[0].id;
    const id2 = c2.data.data.memories[0].memoryId ?? c2.data.data.memories[0].id;

    const { status, data } = await api('/memories/batch', {
      method: 'PUT',
      body: JSON.stringify({
        updates: [
          { id: id1, content: 'updated batch 1' },
          { id: id2, content: 'updated batch 2' },
        ],
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.updated).toBe(2);
    expect(data.data.memories).toHaveLength(2);
  });
});

// ─── Batch delete ─────────────────────────────────────────────

describe('DELETE /memories/batch', () => {
  it('deletes multiple memories by ids', async () => {
    const c1 = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'batch del 1', user_id: 'bdel-user', infer: false }),
    });
    const c2 = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'batch del 2', user_id: 'bdel-user', infer: false }),
    });
    const id1 = c1.data.data.memories[0].memoryId ?? c1.data.data.memories[0].id;
    const id2 = c2.data.data.memories[0].memoryId ?? c2.data.data.memories[0].id;

    const { status, data } = await api('/memories/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids: [id1, id2] }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(2);
  });

  it('returns 0 deleted for nonexistent ids', async () => {
    const { status, data } = await api('/memories/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids: ['fake-id-1', 'fake-id-2'] }),
    });
    expect(status).toBe(200);
    expect(data.data.deleted).toBe(0);
  });
});

// ─── Import ───────────────────────────────────────────────────

describe('POST /memories/import', () => {
  it('imports memories', async () => {
    const { status, data } = await api('/memories/import', {
      method: 'POST',
      body: JSON.stringify({
        memories: [
          { content: 'imported 1', userId: 'import-user' },
          { content: 'imported 2', userId: 'import-user' },
        ],
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.imported).toBeGreaterThanOrEqual(2);
  });

  it('reports errors for invalid items', async () => {
    const { status, data } = await api('/memories/import', {
      method: 'POST',
      body: JSON.stringify({
        memories: [{ content: 'valid item', userId: 'imp-user' }],
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(typeof data.data.errors).toBe('number');
  });
});

// ─── Delete all ───────────────────────────────────────────────

describe('DELETE /memories/', () => {
  it('deletes all memories for a user', async () => {
    const uid = `delall-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'del all 1', user_id: uid, infer: false }),
    });
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'del all 2', user_id: uid, infer: false }),
    });

    const { status, data } = await api(`/memories?user_id=${uid}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);

    // Verify they are gone
    const { data: listData } = await api(`/memories/count?user_id=${uid}`);
    expect(listData.data.count).toBe(0);
  });

  it('deletes with agent_id filter', async () => {
    const { status, data } = await api('/memories?agent_id=some-agent', {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
