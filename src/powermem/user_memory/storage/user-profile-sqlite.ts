/**
 * SQLite-backed user profile storage.
 * Port of Python powermem/user_memory/storage/user_profile_sqlite.py.
 */
import Database from 'better-sqlite3';
import type { UserProfile } from './base.js';
import { UserProfileStoreBase } from './base.js';
import { SnowflakeIDGenerator } from '../../utils/snowflake.js';

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
      .get(userId) as any;
    if (!row) return null;
    return this.toProfile(row);
  }

  async getProfiles(options: { userId?: string; mainTopic?: string; limit?: number; offset?: number } = {}): Promise<UserProfile[]> {
    let sql = 'SELECT * FROM user_profiles';
    const params: unknown[] = [];
    if (options.userId) { sql += ' WHERE user_id = ?'; params.push(options.userId); }
    sql += ' ORDER BY id DESC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset) { sql += ' OFFSET ?'; params.push(options.offset); }

    const rows = this.db.prepare(sql).all(...params) as any[];
    let profiles = rows.map((r) => this.toProfile(r));

    if (options.mainTopic) {
      profiles = profiles.filter((p) => p.topics && options.mainTopic! in (p.topics as Record<string, unknown>));
    }
    return profiles;
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM user_profiles WHERE id = ?').run(profileId);
    return result.changes > 0;
  }

  async countProfiles(userId?: string): Promise<number> {
    if (userId) {
      const row = this.db.prepare('SELECT COUNT(*) as cnt FROM user_profiles WHERE user_id = ?').get(userId) as { cnt: number };
      return row.cnt;
    }
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM user_profiles').get() as { cnt: number };
    return row.cnt;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private toProfile(row: any): UserProfile {
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
