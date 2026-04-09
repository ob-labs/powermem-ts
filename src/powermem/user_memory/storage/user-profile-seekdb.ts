/**
 * SeekDB-backed user profile storage.
 */
import path from 'node:path';
import type { UserProfile } from './base.js';
import { UserProfileStoreBase } from './base.js';
import { SnowflakeIDGenerator } from '../../utils/snowflake.js';

type SeekDBProfileStoreConfig = {
  path?: string;
  database?: string;
  tableName?: string;
};

type ProfileRow = {
  id: string | number;
  user_id: string;
  profile_content?: string | null;
  topics?: string | null;
  created_at: string;
  updated_at: string;
};

export class SeekDBUserProfileStore extends UserProfileStoreBase {
  private static readonly sharedClients = new Map<string, { client: any; refCount: number }>();
  private static readonly embeddedAdminDatabase = 'test';

  private readonly idGen = new SnowflakeIDGenerator();
  private readonly tableName: string;
  private readonly dbPath: string;
  private readonly database: string;
  private readonly clientKey: string;
  private client: any;
  private isClosed = false;
  private readonly ready: Promise<void>;

  constructor(config: string | SeekDBProfileStoreConfig = {}) {
    super();
    const normalizedConfig = typeof config === 'string'
      ? { path: config }
      : config;
    this.dbPath = normalizedConfig.path ?? './seekdb_data';
    this.database = normalizedConfig.database ?? 'test';
    this.tableName = normalizedConfig.tableName ?? 'user_profiles';
    this.clientKey = SeekDBUserProfileStore.buildClientKey(this.dbPath, this.database);
    this.ready = this.initialize();
  }

  private static buildClientKey(dbPath: string, database: string): string {
    return `${path.resolve(dbPath)}::${database}`;
  }

  private static async loadSeekDB(): Promise<{ SeekdbClient: any }> {
    return await import('seekdb') as { SeekdbClient: any };
  }

  private static acquireClient(dbPath: string, database: string, SeekdbClient: any): { client: any; key: string } {
    const key = SeekDBUserProfileStore.buildClientKey(dbPath, database);
    const existing = SeekDBUserProfileStore.sharedClients.get(key);
    if (existing) {
      existing.refCount += 1;
      return { client: existing.client, key };
    }

    const client = new SeekdbClient({ path: dbPath, database });
    SeekDBUserProfileStore.sharedClients.set(key, { client, refCount: 1 });
    return { client, key };
  }

  private static async releaseClient(key: string): Promise<void> {
    const entry = SeekDBUserProfileStore.sharedClients.get(key);
    if (!entry) return;

    entry.refCount -= 1;
    if (entry.refCount > 0) return;

    SeekDBUserProfileStore.sharedClients.delete(key);
    await entry.client?.close?.();
  }

  private static quoteIdentifier(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
  }

  private static async ensureEmbeddedDatabaseExists(dbPath: string, database: string, SeekdbClient: any): Promise<void> {
    const targetDatabase = database.trim();
    if (!targetDatabase || targetDatabase === SeekDBUserProfileStore.embeddedAdminDatabase) {
      return;
    }

    const { client, key } = SeekDBUserProfileStore.acquireClient(
      dbPath,
      SeekDBUserProfileStore.embeddedAdminDatabase,
      SeekdbClient,
    );

    try {
      if (typeof client.execute === 'function') {
        await client.execute(
          `CREATE DATABASE IF NOT EXISTS ${SeekDBUserProfileStore.quoteIdentifier(targetDatabase)}`
        );
        return;
      }

      if (typeof client.listDatabases === 'function' && typeof client.createDatabase === 'function') {
        const databases = await client.listDatabases();
        const exists = Array.isArray(databases)
          && databases.some((entry: { name?: unknown }) => entry?.name === targetDatabase);
        if (!exists) {
          await client.createDatabase(targetDatabase);
        }
        return;
      }

      throw new Error('seekdb client does not expose a supported database creation API.');
    } finally {
      await SeekDBUserProfileStore.releaseClient(key);
    }
  }

  private async initialize(): Promise<void> {
    const { SeekdbClient } = await SeekDBUserProfileStore.loadSeekDB();
    await SeekDBUserProfileStore.ensureEmbeddedDatabaseExists(this.dbPath, this.database, SeekdbClient);
    const { client } = SeekDBUserProfileStore.acquireClient(this.dbPath, this.database, SeekdbClient);
    this.client = client;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_content TEXT,
        topics TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    await this.client.execute(
      `CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} (user_id)`
    );
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private parseTopics(value: string | null | undefined): Record<string, unknown> | undefined {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private toProfile(row: ProfileRow): UserProfile {
    return {
      id: String(row.id),
      userId: row.user_id,
      profileContent: row.profile_content ?? undefined,
      topics: this.parseTopics(row.topics),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
      if (Array.isArray(obj)) return obj.some((item) => searchValue(item));
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

  async saveProfile(userId: string, profileContent?: string, topics?: Record<string, unknown>): Promise<string> {
    await this.ensureReady();
    const existingRows = await this.client.execute(
      `SELECT id FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId],
    ) as Array<{ id: string | number }>;

    const now = new Date().toISOString();
    const topicsJson = topics ? JSON.stringify(topics) : null;

    if (existingRows.length > 0) {
      const existingId = String(existingRows[0].id);
      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [now];

      if (profileContent !== undefined) {
        sets.push('profile_content = ?');
        params.push(profileContent);
      }
      if (topics !== undefined) {
        sets.push('topics = ?');
        params.push(topicsJson);
      }
      params.push(existingId);

      await this.client.execute(
        `UPDATE ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} SET ${sets.join(', ')} WHERE id = ?`,
        params,
      );
      return existingId;
    }

    const id = this.idGen.nextId();
    await this.client.execute(
      `INSERT INTO ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} (id, user_id, profile_content, topics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, profileContent ?? null, topicsJson, now, now],
    );
    return id;
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | null> {
    await this.ensureReady();
    const rows = await this.client.execute(
      `SELECT id, user_id, profile_content, topics, created_at, updated_at FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId],
    ) as ProfileRow[];
    if (rows.length === 0) return null;
    return this.toProfile(rows[0]);
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
    await this.ensureReady();

    let sql = `SELECT id, user_id, profile_content, topics, created_at, updated_at FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)}`;
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
    const rows = await this.client.execute(sql, params) as ProfileRow[];

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
    await this.ensureReady();
    const rows = await this.client.execute(
      `SELECT id FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} WHERE id = ? LIMIT 1`,
      [profileId],
    ) as Array<{ id: string | number }>;
    if (rows.length === 0) return false;
    await this.client.execute(
      `DELETE FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)} WHERE id = ?`,
      [profileId],
    );
    return true;
  }

  async countProfiles(userId?: string, fuzzy = false): Promise<number> {
    await this.ensureReady();
    let sql = `SELECT COUNT(*) AS count FROM ${SeekDBUserProfileStore.quoteIdentifier(this.tableName)}`;
    const params: unknown[] = [];
    if (userId) {
      if (fuzzy) {
        sql += ' WHERE user_id LIKE ?';
        params.push(`%${userId}%`);
      } else {
        sql += ' WHERE user_id = ?';
        params.push(userId);
      }
    }

    const rows = await this.client.execute(sql, params) as Array<{ count: number | string }>;
    return Number(rows[0]?.count ?? 0);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    await this.ready.catch(() => undefined);
    await SeekDBUserProfileStore.releaseClient(this.clientKey);
  }
}

UserProfileStoreBase.registerProvider(
  'seekdb',
  SeekDBUserProfileStore,
  'powermem.user_memory.storage.user_profile_seekdb.SeekDBUserProfileStore',
);
