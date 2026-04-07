/**
 * UserMemory tests — port of Python regression/test_user_profile.py.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Memory } from '../../../src/powermem/core/memory.js';
import { UserMemory } from '../../../src/powermem/user_memory/user_memory.js';
import { SQLiteUserProfileStore } from '../../../src/powermem/user_memory/storage/user-profile-sqlite.js';
import { MockEmbeddings } from '../../mocks.js';

describe('UserMemory', () => {
  let userMem: UserMemory;

  afterEach(async () => {
    if (userMem) await userMem.close();
  });

  async function createUserMemory() {
    const memory = await Memory.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
    const profileStore = new SQLiteUserProfileStore(':memory:');
    return new UserMemory({ memory, profileStore });
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
