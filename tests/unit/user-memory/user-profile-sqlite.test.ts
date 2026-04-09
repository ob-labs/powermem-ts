/**
 * SQLiteUserProfileStore tests — port of Python regression/test_user_profile.py.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteUserProfileStore } from '../../../src/powermem/user_memory/storage/user-profile-sqlite.js';

describe('SQLiteUserProfileStore', () => {
  let store: SQLiteUserProfileStore;

  beforeEach(() => {
    store = new SQLiteUserProfileStore(':memory:');
  });

  afterEach(async () => {
    await store.close();
  });

  it('saveProfile creates new profile', async () => {
    const id = await store.saveProfile('user1', 'Alice is a software engineer');
    expect(id).toBeTruthy();

    const profile = await store.getProfileByUserId('user1');
    expect(profile).not.toBeNull();
    expect(profile!.userId).toBe('user1');
    expect(profile!.profileContent).toBe('Alice is a software engineer');
  });

  it('saveProfile updates existing profile', async () => {
    await store.saveProfile('user1', 'initial profile');
    await store.saveProfile('user1', 'updated profile');

    const profile = await store.getProfileByUserId('user1');
    expect(profile!.profileContent).toBe('updated profile');

    // Should still be 1 profile, not 2
    expect(await store.countProfiles('user1')).toBe(1);
  });

  it('saveProfile with topics', async () => {
    await store.saveProfile('user1', undefined, {
      preferences: { coffee: 'dark roast', music: 'jazz' },
      work: { role: 'engineer' },
    });

    const profile = await store.getProfileByUserId('user1');
    expect(profile!.topics).toBeDefined();
    expect((profile!.topics as any).preferences.coffee).toBe('dark roast');
  });

  it('getProfileByUserId returns null for nonexistent', async () => {
    expect(await store.getProfileByUserId('nobody')).toBeNull();
  });

  it('getProfiles lists profiles', async () => {
    await store.saveProfile('alice', 'Alice profile');
    await store.saveProfile('bob', 'Bob profile');

    const all = await store.getProfiles();
    expect(all.length).toBe(2);

    const aliceOnly = await store.getProfiles({ userId: 'alice' });
    expect(aliceOnly.length).toBe(1);
    expect(aliceOnly[0].userId).toBe('alice');
  });

  it('getProfiles with pagination', async () => {
    await store.saveProfile('u1', 'p1');
    await store.saveProfile('u2', 'p2');
    await store.saveProfile('u3', 'p3');

    const page = await store.getProfiles({ limit: 2 });
    expect(page.length).toBe(2);
  });

  it('getProfiles with mainTopic filter', async () => {
    await store.saveProfile('u1', undefined, { food: { fav: 'pizza' } });
    await store.saveProfile('u2', undefined, { work: { role: 'dev' } });

    const foodProfiles = await store.getProfiles({ mainTopic: ['food'] });
    expect(foodProfiles.length).toBe(1);
    expect(foodProfiles[0].userId).toBe('u1');
  });

  it('getProfiles with subTopic and topicValue filters', async () => {
    await store.saveProfile('u1', undefined, { food: { fav: 'pizza' }, city: { home: 'Hangzhou' } });
    await store.saveProfile('u2', undefined, { food: { fav: 'salad' }, city: { home: 'Shanghai' } });

    const bySubTopic = await store.getProfiles({ subTopic: ['food.fav'] });
    expect(bySubTopic.length).toBe(2);

    const byTopicValue = await store.getProfiles({ topicValue: ['pizza'] });
    expect(byTopicValue.length).toBe(1);
    expect(byTopicValue[0].userId).toBe('u1');
    expect(byTopicValue[0].topics).toEqual({ food: { fav: 'pizza' }, city: { home: 'Hangzhou' } });
  });

  it('getProfiles supports fuzzy user filter', async () => {
    await store.saveProfile('user-alpha', 'alpha');
    await store.saveProfile('user-beta', 'beta');

    const fuzzyProfiles = await store.getProfiles({ userId: 'user-', fuzzy: true });
    expect(fuzzyProfiles.length).toBe(2);
    expect(await store.countProfiles('user-', true)).toBe(2);
  });

  it('deleteProfile removes profile', async () => {
    const id = await store.saveProfile('user1', 'to delete');
    expect(await store.deleteProfile(id)).toBe(true);
    expect(await store.getProfileByUserId('user1')).toBeNull();
  });

  it('deleteProfile returns false for nonexistent', async () => {
    expect(await store.deleteProfile('99999')).toBe(false);
  });

  it('countProfiles', async () => {
    expect(await store.countProfiles()).toBe(0);
    await store.saveProfile('u1', 'p1');
    await store.saveProfile('u2', 'p2');
    expect(await store.countProfiles()).toBe(2);
    expect(await store.countProfiles('u1')).toBe(1);
  });
});
