/**
 * AgentMemory tests — port of Python regression/test_scenario_3_multi_agent.py.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/powermem/settings.js', () => ({
  getDefaultEnvFile: () => undefined,
}));

import { Memory } from '../../../src/powermem/core/memory.js';
import { AgentMemory } from '../../../src/powermem/agent/agent.js';
import { MemoryScope, AccessPermission } from '../../../src/powermem/agent/types.js';
import { MockEmbeddings } from '../../mocks.js';

describe('AgentMemory', () => {
  let agentMem: AgentMemory;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.POWERMEM_ENV_FILE;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_LLM_BASE_URL;
    delete process.env.QWEN_LLM_BASE_URL;
  });

  afterEach(async () => {
    if (agentMem) await agentMem.close();
    process.env = { ...originalEnv };
  });

  async function createAgentMemory(mode = 'multi_agent') {
    const memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
    return new AgentMemory(memory, { mode: mode as any });
  }

  it('initializes with default mode', async () => {
    agentMem = await createAgentMemory();
    expect(agentMem.getMode()).toBe('multi_agent');
  });

  it('add stores memory with scope', async () => {
    agentMem = await createAgentMemory();
    const result = await agentMem.add('test memory', {
      userId: 'user1', agentId: 'agent1',
    });
    expect(result.memories).toBeDefined();
    expect(result.scope).toBeDefined();
  });

  it('search returns results', async () => {
    agentMem = await createAgentMemory();
    await agentMem.add('I love coffee', { userId: 'u1', agentId: 'a1' });
    const results = await agentMem.search('coffee', { userId: 'u1', agentId: 'a1' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('getAll returns memories', async () => {
    agentMem = await createAgentMemory();
    await agentMem.add('mem1', { userId: 'u1', agentId: 'a1' });
    await agentMem.add('mem2', { userId: 'u1', agentId: 'a1' });
    const all = await agentMem.getAll({ userId: 'u1', agentId: 'a1' });
    expect(all.length).toBe(2);
  });

  it('delete removes memory', async () => {
    agentMem = await createAgentMemory();
    const result = await agentMem.add('to delete', { userId: 'u1', agentId: 'a1' });
    const id = (result.memories as any)[0].memoryId;
    expect(await agentMem.delete(id)).toBe(true);
  });

  it('deleteAll clears agent memories', async () => {
    agentMem = await createAgentMemory();
    await agentMem.add('a', { userId: 'u1', agentId: 'a1' });
    await agentMem.add('b', { userId: 'u1', agentId: 'a1' });
    await agentMem.deleteAll({ userId: 'u1', agentId: 'a1' });
    const all = await agentMem.getAll({ userId: 'u1', agentId: 'a1' });
    expect(all.length).toBe(0);
  });

  it('getStatistics returns mode', async () => {
    agentMem = await createAgentMemory();
    const stats = await agentMem.getStatistics();
    expect(stats.mode).toBe('multi_agent');
    expect(typeof stats.totalMemories).toBe('number');
  });

  it('grantPermission and checkPermission work', async () => {
    agentMem = await createAgentMemory();
    await agentMem.grantPermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    const hasWrite = await agentMem.checkPermission('agent1', 'mem1', AccessPermission.WRITE);
    expect(hasWrite).toBe(true);
  });

  it('reset clears all', async () => {
    agentMem = await createAgentMemory();
    await agentMem.add('a', { userId: 'u1' });
    await agentMem.reset();
    const stats = await agentMem.getStatistics();
    expect(stats.totalMemories).toBe(0);
  });
});
