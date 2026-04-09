/**
 * SQLite-backed user profile storage.
 * Port of Python powermem/user_memory/storage/user_profile_sqlite.py.
 */
import Database from 'better-sqlite3';
import type { UserProfile } from './base.js';
import { UserProfileStoreBase } from './base.js';
import { SnowflakeIDGenerator } from '../../utils/snowflake.js';

type ProfileRow = {
  id: string;
  user_id: string;
  profile_content?: string | null;
  topics?: string | null;
  created_at: string;
  updated_at: string;
};

export class SQLiteUserProfileStore extends UserProfileStoreBase {
  private db: Database.Database;
  private idGen = new SnowflakeIDGenerator();

  constructor(config: string | { dbPath?: string; path?: string } = ':memory:') {
    super();
    const dbPath = typeof config === 'string'
      ? config
      : config.dbPath ?? config.path ?? ':memory:';
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_content TEXT,
        topics TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON user_profiles(user_id)');
  }

  async saveProfile(userId: string, profileContent?: string, topics?: Record<string, unknown>): Promise<string> {
    const existing = this.db.prepare('SELECT id FROM user_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as { id: string } | undefined;

    const now = new Date().toISOString();
    const topicsJson = topics ? JSON.stringify(topics) : null;

    if (existing) {
      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [now];
      if (profileContent !== undefined) { sets.push('profile_content = ?'); params.push(profileContent); }
      if (topics !== undefined) { sets.push('topics = ?'); params.push(topicsJson); }
      params.push(existing.id);
      this.db.prepare(`UPDATE user_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return existing.id;
    }

    const id = this.idGen.nextId();
    this.db.prepare(
      'INSERT INTO user_profiles (id, user_id, profile_content, topics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, userId, profileContent ?? null, topicsJson, now, now);
    return id;
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | null> {
    const row = this.db.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as ProfileRow | undefined;
    if (!row) return null;
    return this.toProfile(row);
  }

  private checkJsonPathExists(topics: Record<string, unknown> | undefined, jsonPath: string): boolean {
    if (!topics || typeof topics !== 'object' || Array.isArray(topics)) return false;

    const normalizedPath = jsonPath.startsWith('$.') ? jsonPath.slice(2) : jsonPath;
    const parts = normalizedPath.split('.');
    let current: unknown = topics;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || Array.isArray(current) || !(part in (current as Record<string, unknown>))) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return true;
  }

  private checkTopicValueExists(topics: Record<string, unknown> | undefined, value: string): boolean {
    if (!topics) return false;

    const searchValue = (obj: unknown): boolean => {
      if (Array.isArray(obj)) {
        return obj.some((item) => searchValue(item));
      }
      if (obj && typeof obj === 'object') {
        return Object.values(obj as Record<string, unknown>).some((nested) => searchValue(nested));
      }
      if (typeof obj === 'string') return obj === value;
      if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj) === value;
      return false;
    };

    return searchValue(topics);
  }

  private matchesFilters(
    topics: Record<string, unknown> | undefined,
    options: { mainTopic?: string[]; subTopic?: string[]; topicValue?: string[] },
  ): boolean {
    if (!topics) {
      return !options.mainTopic?.length && !options.subTopic?.length && !options.topicValue?.length;
    }

    if (options.mainTopic?.length) {
      const mainTopicMatch = options.mainTopic.some((mainTopic) => this.checkJsonPathExists(topics, `$.${mainTopic}`));
      if (!mainTopicMatch) return false;
    }

    if (options.subTopic?.length) {
      const validSubTopics = options.subTopic.filter((subTopic) => subTopic.includes('.'));
      if (validSubTopics.length > 0) {
        const subTopicMatch = validSubTopics.some((subTopic) => this.checkJsonPathExists(topics, `$.${subTopic}`));
        if (!subTopicMatch) return false;
      }
    }

    if (options.topicValue?.length) {
      const validValues = options.topicValue.filter((topicValue) => topicValue != null);
      if (validValues.length > 0) {
        const topicValueMatch = validValues.some((topicValue) => this.checkTopicValueExists(topics, topicValue));
        if (!topicValueMatch) return false;
      }
    }

    return true;
  }

  private filterTopicsInMemory(
    topics: Record<string, unknown> | undefined,
    mainTopic?: string[],
    subTopic?: string[],
  ): Record<string, unknown> | undefined {
    if (!topics || typeof topics !== 'object' || Array.isArray(topics)) return undefined;
    if ((!mainTopic || mainTopic.length === 0) && (!subTopic || subTopic.length === 0)) {
      return topics;
    }

    const filteredResult: Record<string, unknown> = {};

    for (const [mainTopicKey, subTopics] of Object.entries(topics)) {
      const includeMain = !mainTopic?.length
        || mainTopic.some((item) => item.toLowerCase() === mainTopicKey.toLowerCase());

      if (!includeMain) continue;

      if (subTopics && typeof subTopics === 'object' && !Array.isArray(subTopics)) {
        const filteredSubTopics: Record<string, unknown> = {};
        for (const [subTopicKey, subTopicValue] of Object.entries(subTopics)) {
          const includeSub = !subTopic?.length || subTopic.some((item) => {
            if (item.includes('.')) {
              return item.toLowerCase() === `${mainTopicKey.toLowerCase()}.${subTopicKey.toLowerCase()}`;
            }
            return item.toLowerCase() === subTopicKey.toLowerCase();
          });

          if (includeSub) {
            filteredSubTopics[subTopicKey] = subTopicValue;
          }
        }

        if (Object.keys(filteredSubTopics).length > 0 || !subTopic?.length) {
          filteredResult[mainTopicKey] = filteredSubTopics;
        }
        continue;
      }

      filteredResult[mainTopicKey] = subTopics;
    }

    return filteredResult;
  }

  async getProfiles(options: {
    userId?: string;
    fuzzy?: boolean;
    mainTopic?: string[];
    subTopic?: string[];
    topicValue?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<UserProfile[]> {
    let sql = 'SELECT * FROM user_profiles';
    const params: unknown[] = [];

    if (options.userId) {
      if (options.fuzzy) {
        sql += ' WHERE user_id LIKE ?';
        params.push(`%${options.userId}%`);
      } else {
        sql += ' WHERE user_id = ?';
        params.push(options.userId);
      }
    }

    sql += ' ORDER BY id DESC';

    const rows = this.db.prepare(sql).all(...params) as ProfileRow[];
    let profiles = rows
      .map((row) => this.toProfile(row))
      .filter((profile) => this.matchesFilters(profile.topics, options))
      .map((profile) => ({
        ...profile,
        topics: this.filterTopicsInMemory(profile.topics, options.mainTopic, options.subTopic),
      }));

    if (options.offset && options.offset > 0) {
      profiles = profiles.slice(options.offset);
    }
    if (options.limit && options.limit > 0) {
      profiles = profiles.slice(0, options.limit);
    }

    return profiles;
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM user_profiles WHERE id = ?').run(profileId);
    return result.changes > 0;
  }

  async countProfiles(userId?: string, fuzzy = false): Promise<number> {
    if (userId) {
      const row = fuzzy
        ? this.db.prepare('SELECT COUNT(*) as cnt FROM user_profiles WHERE user_id LIKE ?').get(`%${userId}%`) as { cnt: number }
        : this.db.prepare('SELECT COUNT(*) as cnt FROM user_profiles WHERE user_id = ?').get(userId) as { cnt: number };
      return row.cnt;
    }
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM user_profiles').get() as { cnt: number };
    return row.cnt;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private toProfile(row: ProfileRow): UserProfile {
    return {
      id: String(row.id),
      userId: row.user_id,
      profileContent: row.profile_content ?? undefined,
      topics: row.topics ? JSON.parse(row.topics) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

UserProfileStoreBase.registerProvider(
  'sqlite',
  SQLiteUserProfileStore,
  'powermem.user_memory.storage.user_profile_sqlite.SQLiteUserProfileStore',
);
