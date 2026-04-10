/**
 * UserMemory tests — port of Python regression/test_user_profile.py.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Memory } from '../../../src/powermem/core/memory.js';
import { UserMemory } from '../../../src/powermem/user_memory/user_memory.js';
import { SQLiteUserProfileStore } from '../../../src/powermem/user_memory/storage/user-profile-sqlite.js';
import { MockEmbeddings, MockLLM } from '../../mocks.js';

describe('UserMemory', () => {
  let userMem: UserMemory;

  afterEach(async () => {
    if (userMem) await userMem.close();
  });

  async function createUserMemory(llm?: MockLLM) {
    const memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
      llm,
    });
    const profileStore = new SQLiteUserProfileStore(':memory:');
    return new UserMemory({ memory, profileStore, llm });
  }

  it('add stores memory', async () => {
    userMem = await createUserMemory();
    const result = await userMem.add('I like coffee', { userId: 'u1' });
    expect(result.memories).toBeDefined();
  });

  it('add with extractProfile stores profile', async () => {
    userMem = await createUserMemory();
    const result = await userMem.add('I like coffee', {
      userId: 'u1',
      extractProfile: true,
      profileContent: 'Likes coffee',
    });
    expect(result.profileExtracted).toBe(true);

    const profile = await userMem.profile('u1');
    expect(profile).not.toBeNull();
    expect(profile!.profileContent).toBe('Likes coffee');
  });

  it('add extracts profile content with llm', async () => {
    const llm = new MockLLM(['User likes coffee and lives in Hangzhou.']);
    userMem = await createUserMemory(llm);

    const result = await userMem.add([
      { role: 'user', content: 'I like coffee.' },
      { role: 'assistant', content: 'Coffee is great.' },
      { role: 'user', content: 'I live in Hangzhou.' },
    ], {
      userId: 'u1',
      includeRoles: ['user'],
      excludeRoles: ['assistant'],
    });

    expect(result.profileExtracted).toBe(true);
    expect(result.profileContent).toBe('User likes coffee and lives in Hangzhou.');

    const prompts = llm.calls
      .flatMap((messages) => messages.map((message) => String(message.content ?? '')));
    const profilePrompt = prompts.find((prompt) => prompt.includes('[Conversation]:')) ?? '';
    expect(profilePrompt).toContain('user: I like coffee.');
    expect(profilePrompt).toContain('user: I live in Hangzhou.');
    expect(profilePrompt).not.toContain('assistant: Coffee is great.');
  });

  it('add extracts structured topics with llm', async () => {
    const llm = new MockLLM([
      JSON.stringify({
        preferences: { beverage: 'coffee' },
        location: { city: 'Hangzhou' },
      }),
    ]);
    userMem = await createUserMemory(llm);

    const result = await userMem.add('I like coffee and live in Hangzhou.', {
      userId: 'u1',
      profileType: 'topics',
      customTopics: JSON.stringify({
        preferences: { beverage: 'Preferred beverage' },
        location: { city: 'City' },
      }),
      strictMode: true,
    });

    expect(result.profileExtracted).toBe(true);
    expect(result.topics).toEqual({
      preferences: { beverage: 'coffee' },
      location: { city: 'Hangzhou' },
    });
  });

  it('search returns results', async () => {
    userMem = await createUserMemory();
    await userMem.add('I love hiking in mountains', { userId: 'u1', infer: false });
    const result = await userMem.search('hiking', { userId: 'u1' });
    expect(result.results).toBeDefined();
  });

  it('search with addProfile includes profile data', async () => {
    userMem = await createUserMemory();
    await userMem.add('memory content', { userId: 'u1', infer: false });
    await userMem.add('more content', {
      userId: 'u1',
      extractProfile: true,
      profileContent: 'User profile data',
    });

    const result = await userMem.search('content', { userId: 'u1', addProfile: true });
    expect(result.profileContent).toBe('User profile data');
  });

  it('create auto-wires query rewriter from memory config', async () => {
    const llm = new MockLLM(['hiking travel preferences']);
    userMem = await UserMemory.create({
      memoryOptions: {
        embeddings: new MockEmbeddings(),
        llm,
        dbPath: ':memory:',
        config: {
          queryRewrite: { enabled: true },
        },
      },
    });

    await userMem.add('I enjoy hiking and travel.', {
      userId: 'u1',
      infer: false,
      profileContent: 'User enjoys hiking and travel.',
    });

    await userMem.search('preferences', { userId: 'u1' });
    expect(llm.calls.length).toBeGreaterThan(0);
    const rewritePrompt = String(llm.calls.at(-1)?.[1]?.content ?? '');
    expect(rewritePrompt).toContain('Original query: "preferences"');
    expect(rewritePrompt).toContain('User enjoys hiking and travel.');
  });

  it('create owns its internal memory by default', async () => {
    userMem = await UserMemory.create({
      memoryOptions: {
        embeddings: new MockEmbeddings(),
        dbPath: ':memory:',
      },
    });

    expect(userMem.getMemory()).toBeDefined();
    const result = await userMem.add('I prefer tea.', { userId: 'u-owned', infer: false });
    expect(result.memories).toBeDefined();
  });

  it('profile returns null for nonexistent user', async () => {
    userMem = await createUserMemory();
    expect(await userMem.profile('nobody')).toBeNull();
  });

  it('deleteProfile removes profile', async () => {
    userMem = await createUserMemory();
    await userMem.add('x', {
      userId: 'u1',
      extractProfile: true,
      profileContent: 'to delete',
    });
    expect(await userMem.deleteProfile('u1')).toBe(true);
    expect(await userMem.profile('u1')).toBeNull();
  });

  it('deleteProfile returns false for nonexistent', async () => {
    userMem = await createUserMemory();
    expect(await userMem.deleteProfile('nobody')).toBe(false);
  });

  it('deleteAll with deleteProfile removes both', async () => {
    userMem = await createUserMemory();
    await userMem.add('memory', { userId: 'u1', infer: false });
    await userMem.add('with profile', {
      userId: 'u1',
      extractProfile: true,
      profileContent: 'profile data',
    });

    await userMem.deleteAll('u1', { deleteProfile: true });
    expect(await userMem.profile('u1')).toBeNull();
  });
});
