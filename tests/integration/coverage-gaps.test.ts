/**
 * Tests targeting specific uncovered lines/branches to close coverage gaps.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Memory } from '../../src/core/memory.js';
import { NativeProvider } from '../../src/core/native-provider.js';
import { SQLiteStore } from '../../src/storage/sqlite/sqlite.js';
import { PowerMemError } from '../../src/errors/index.js';
import { MockEmbeddings, MockLLM } from '../mocks.js';

// ── memory.ts:41-42 — HttpProvider (serverUrl) path ──────────────────────

describe('Memory.create with serverUrl', () => {
  it('creates HttpProvider when serverUrl is provided', async () => {
    // We can't actually connect, but we can verify it creates without throwing
    // during construction (HttpProvider is lazy — no connection until first call)
    const memory = await Memory.create({
      serverUrl: 'http://127.0.0.1:19999',
    });
    expect(memory).toBeDefined();
    await memory.close(); // no-op for HttpProvider
  });
});

// ── store.ts:170-175 — agentId and runId filter branches ─────────────────

describe('SQLiteStore filters', () => {
  let store: SQLiteStore;

  beforeEach(() => {
    store = new SQLiteStore(':memory:');
  });
  afterEach(() => {
    store.close();
  });

  it('list filters by agentId', async () => {
    await store.insert('1', [1, 0], {
      data: 'a1', agent_id: 'agent-a', user_id: null, run_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });
    await store.insert('2', [0, 1], {
      data: 'b1', agent_id: 'agent-b', user_id: null, run_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });

    const { records, total } = await store.list({ agentId: 'agent-a' });
    expect(total).toBe(1);
    expect(records[0].agentId).toBe('agent-a');
  });

  it('list filters by runId', async () => {
    await store.insert('1', [1, 0], {
      data: 'r1', run_id: 'run-1', user_id: null, agent_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });
    await store.insert('2', [0, 1], {
      data: 'r2', run_id: 'run-2', user_id: null, agent_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });

    const { records, total } = await store.list({ runId: 'run-1' });
    expect(total).toBe(1);
    expect(records[0].runId).toBe('run-1');
  });

  it('search filters by runId', async () => {
    await store.insert('1', [1, 0], {
      data: 'r1', run_id: 'run-1', user_id: null, agent_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });
    await store.insert('2', [1, 0], {
      data: 'r2', run_id: 'run-2', user_id: null, agent_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });

    const results = await store.search([1, 0], { runId: 'run-1' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('r1');
  });

  it('removeAll filters by agentId', async () => {
    await store.insert('1', [1, 0], {
      data: 'a1', agent_id: 'agent-a', user_id: null, run_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });
    await store.insert('2', [0, 1], {
      data: 'b1', agent_id: 'agent-b', user_id: null, run_id: null,
      hash: 'h', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      category: null, metadata: {},
    });

    await store.removeAll({ agentId: 'agent-a' });
    const { total } = await store.list();
    expect(total).toBe(1);
  });
});

// ── index.ts:319 — update throws for non-existent ID ─────────────────────

describe('NativeProvider edge cases', () => {
  let provider: NativeProvider;

  afterEach(async () => {
    if (provider) await provider.close();
  });

  it('update throws for non-existent memory', async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await expect(
      provider.update('999999', { content: 'nope' })
    ).rejects.toThrow('Memory not found');

    await expect(
      provider.update('999999', { content: 'nope' })
    ).rejects.toBeInstanceOf(PowerMemError);
  });

  it('update metadata only (no content change) does not re-embed', async () => {
    const embeddings = new MockEmbeddings();
    provider = await NativeProvider.create({
      embeddings,
      dbPath: ':memory:',
    });

    const added = await provider.add({ content: 'original', infer: false });
    const id = added.memories[0].id;
    const callsBefore = embeddings.calls.length;

    await provider.update(id, { metadata: { key: 'value' } });
    // No additional embedding call since content didn't change
    expect(embeddings.calls.length).toBe(callsBefore);

    const mem = await provider.get(id);
    expect(mem!.metadata).toEqual({ key: 'value' });
  });

  it('create falls back gracefully when LLM env is not configured', async () => {
    // No llm option, no env vars → inferrer should be undefined, infer falls back to simple
    const origLlmKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    // infer defaults to true but no LLM → falls back to simple add
    const result = await provider.add({ content: 'test without llm' });
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('test without llm');

    process.env.LLM_API_KEY = origLlmKey;
  });

  it('search with runId filter works end-to-end', async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });

    await provider.add({ content: 'run1 data', runId: 'r1', infer: false });
    await provider.add({ content: 'run2 data', runId: 'r2', infer: false });

    const result = await provider.search({ query: 'data', runId: 'r1' });
    expect(result.results).toHaveLength(1);
  });
});

// ── index.ts:70 — mkdir for db directory ──────────────────────────────────

describe('NativeProvider with file-based DB', () => {
  it('creates db directory if it does not exist', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const tmpDir = path.join(os.tmpdir(), `powermem-test-${Date.now()}`);
    const dbPath = path.join(tmpDir, 'sub', 'test.db');

    const provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath,
    });

    expect(fs.existsSync(dbPath)).toBe(true);
    await provider.close();

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars

// ── index.ts:76 — embeddings fallback to env (env-based creation) ────────

describe('NativeProvider env-based embeddings fallback', () => {
  it('uses createEmbeddingsFromEnv when embeddings not passed', async () => {
    // Set env vars so the factory can create OpenAI embeddings
    const origProvider = process.env.EMBEDDING_PROVIDER;
    const origKey = process.env.EMBEDDING_API_KEY;
    const origModel = process.env.EMBEDDING_MODEL;
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_API_KEY = 'fake-key-for-test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';

    // This will create OpenAI embeddings from env (won't actually call API)
    const provider = await NativeProvider.create({ dbPath: ':memory:' });
    expect(provider).toBeDefined();
    await provider.close();

    process.env.EMBEDDING_PROVIDER = origProvider;
    process.env.EMBEDDING_API_KEY = origKey;
    process.env.EMBEDDING_MODEL = origModel;
  });
});

// ── provider-factory.ts — anthropic/ollama LLM branches (missing pkg) ────

describe('provider-factory missing peer deps', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('anthropic LLM throws with install instructions', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_API_KEY = 'test-key';

    const { createLLMFromEnv } = await import(
      '../../src/integrations/factory.js'
    );
    // @langchain/anthropic is not installed in dev
    await expect(createLLMFromEnv()).rejects.toThrow('@langchain/anthropic');
  });

  it('ollama LLM creates successfully when @langchain/ollama is installed', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_API_KEY = 'test-key';

    const { createLLMFromEnv } = await import(
      '../../src/integrations/factory.js'
    );
    const llm = await createLLMFromEnv();
    expect(llm).toBeDefined();
  });

  it('ollama embeddings creates successfully when @langchain/ollama is installed', async () => {
    process.env.EMBEDDING_PROVIDER = 'ollama';
    process.env.EMBEDDING_API_KEY = 'test-key';

    const { createEmbeddingsFromEnv } = await import(
      '../../src/integrations/factory.js'
    );
    const embeddings = await createEmbeddingsFromEnv();
    expect(embeddings).toBeDefined();
  });
});
