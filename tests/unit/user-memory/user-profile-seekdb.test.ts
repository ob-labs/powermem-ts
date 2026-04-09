import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SeekDBUserProfileStore } from '../../../src/powermem/user_memory/storage/user-profile-seekdb.js';

async function tryCreateStore(tmpDir: string) {
  try {
    return new SeekDBUserProfileStore({
      path: tmpDir,
      database: 'test',
      tableName: `profiles_${Date.now()}`,
    });
  } catch {
    return null;
  }
}

let seekdbAvailable = false;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-profile-check-'));
  try {
    const store = await tryCreateStore(dir);
    if (store) {
      await store.saveProfile('probe-user', 'probe');
      await store.close();
      seekdbAvailable = true;
    }
  } catch {
    seekdbAvailable = false;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const describeIf = seekdbAvailable ? describe : describe.skip;

describeIf('SeekDBUserProfileStore', () => {
  let store: SeekDBUserProfileStore;
  let tmpDir: string;

  afterEach(async () => {
    if (store) await store.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function createStore() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-profile-'));
    return new SeekDBUserProfileStore({
      path: tmpDir,
      database: 'test',
      tableName: `profiles_${Date.now()}`,
    });
  }

  it('saveProfile persists and updates profiles', async () => {
    store = await createStore();

    await store.saveProfile('u1', 'initial');
    await store.saveProfile('u1', 'updated', { food: { fav: 'pizza' } });

    const profile = await store.getProfileByUserId('u1');
    expect(profile?.profileContent).toBe('updated');
    expect(profile?.topics).toEqual({ food: { fav: 'pizza' } });
    expect(await store.countProfiles('u1')).toBe(1);
  });

  it('supports user/topic filters', async () => {
    store = await createStore();

    await store.saveProfile('user-alpha', undefined, { food: { fav: 'pizza' } });
    await store.saveProfile('user-beta', undefined, { food: { fav: 'salad' } });

    const fuzzyProfiles = await store.getProfiles({ userId: 'user-', fuzzy: true });
    expect(fuzzyProfiles.length).toBe(2);

    const pizzaProfiles = await store.getProfiles({ topicValue: ['pizza'] });
    expect(pizzaProfiles.length).toBe(1);
    expect(pizzaProfiles[0].userId).toBe('user-alpha');
  });
});
