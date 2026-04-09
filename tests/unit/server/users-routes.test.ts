/**
 * Unit tests for user routes (src/server/api/v1/users.ts).
 * Covers profiles listing, single profile CRUD, user memories list/update/delete.
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

// ─── Profiles listing ─────────────────────────────────────────

describe('GET /users/profiles', () => {
  it('returns profiles list', async () => {
    const { status, data } = await api('/users/profiles');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.profiles).toBeDefined();
    expect(Array.isArray(data.data.profiles)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const { data } = await api('/users/profiles?limit=1');
    expect(data.success).toBe(true);
    expect(data.data.profiles.length).toBeLessThanOrEqual(1);
  });
});

// ─── Single user profile ──────────────────────────────────────

describe('GET /users/:userId/profile', () => {
  it('returns profile for a user', async () => {
    // Seed a memory for this user so profile has data
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'user profile data', user_id: 'profile-u1', infer: false }),
    });

    const { status, data } = await api('/users/profile-u1/profile');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.userId).toBe('profile-u1');
  });

  it('returns profile with memoryCount', async () => {
    const { data } = await api('/users/profile-u1/profile');
    expect(typeof data.data.memoryCount).toBe('number');
  });

  it('returns profile with zero count for new user', async () => {
    const { status, data } = await api('/users/brand-new-user/profile');
    expect(status).toBe(200);
    expect(data.data.memoryCount).toBe(0);
  });
});

describe('POST /users/:userId/profile', () => {
  it('adds profile content for a user', async () => {
    const { status, data } = await api('/users/post-profile-u1/profile', {
      method: 'POST',
      body: JSON.stringify({
        content: 'User likes hiking and photography',
        metadata: { source: 'conversation' },
        infer: false,
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('defaults infer to true', async () => {
    // Just verify the endpoint accepts without infer param
    const { status, data } = await api('/users/post-profile-u2/profile', {
      method: 'POST',
      body: JSON.stringify({ content: 'User prefers morning meetings' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('DELETE /users/:userId/profile', () => {
  it('deletes user profile data', async () => {
    // Seed profile data
    await api('/users/del-profile-u1/profile', {
      method: 'POST',
      body: JSON.stringify({ content: 'to be deleted', infer: false }),
    });

    const { status, data } = await api('/users/del-profile-u1/profile', {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
  });
});

// ─── User memories ────────────────────────────────────────────

describe('GET /users/:userId/memories', () => {
  it('returns memories for a user', async () => {
    const uid = `umem-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'user memory 1', user_id: uid, infer: false }),
    });

    const { status, data } = await api(`/users/${uid}/memories`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.memories).toBeDefined();
    expect(data.data.memories.length).toBeGreaterThanOrEqual(1);
  });

  it('respects limit and offset', async () => {
    const uid = `umem-page-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await api('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: `paged ${i}`, user_id: uid, infer: false }),
      });
    }

    const { data: p1 } = await api(`/users/${uid}/memories?limit=2&offset=0`);
    expect(p1.data.memories.length).toBe(2);

    const { data: p2 } = await api(`/users/${uid}/memories?limit=2&offset=2`);
    expect(p2.data.memories.length).toBe(1);
  });

  it('returns empty array for unknown user', async () => {
    const { data } = await api('/users/no-such-user-xyz/memories');
    expect(data.data.memories).toHaveLength(0);
  });
});

describe('PUT /users/:userId/memories/:memoryId', () => {
  it('updates a user memory', async () => {
    const uid = `umem-put-${Date.now()}`;
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'original', user_id: uid, infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status, data } = await api(`/users/${uid}/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'updated via user route' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('updates with metadata', async () => {
    const uid = `umem-putm-${Date.now()}`;
    const created = await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'with meta', user_id: uid, infer: false }),
    });
    const id = created.data.data.memories[0].memoryId ?? created.data.data.memories[0].id;

    const { status } = await api(`/users/${uid}/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'with meta', metadata: { updated: true } }),
    });
    expect(status).toBe(200);
  });
});

describe('DELETE /users/:userId/memories', () => {
  it('deletes all memories for a user', async () => {
    const uid = `umem-del-${Date.now()}`;
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'del me 1', user_id: uid, infer: false }),
    });
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'del me 2', user_id: uid, infer: false }),
    });

    const { status, data } = await api(`/users/${uid}/memories`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);

    // Verify
    const { data: listData } = await api(`/users/${uid}/memories`);
    expect(listData.data.memories).toHaveLength(0);
  });
});
