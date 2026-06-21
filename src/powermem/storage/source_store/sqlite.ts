/**
 * SQLiteSourceStore — SQLite-backed implementation of SourceStoreBase.
 *
 * Round 5 implementation. The Python upstream ships an OceanBase-only
 * concrete implementation; TS ships a portable SQLite-backed implementation
 * so source linking can be exercised locally without a real OceanBase
 * cluster. OceanBase parity is provided via the abstract SourceStoreBase
 * interface — any future OceanBase implementation only needs to satisfy the
 * same contract.
 *
 * Schema (matches Python source_store/oceanbase.py intent):
 *   - sources(id, source_type, content, metadata, user_id, agent_id,
 *             run_id, actor_id, created_at)
 *   - source_memory_links(source_id, memory_id, PRIMARY KEY(source_id, memory_id))
 *   - source_skill_links(source_id, skill_id,  PRIMARY KEY(source_id, skill_id))
 */
import Database from 'better-sqlite3';
import type { SourceRecord, SourceStoreBase } from './base.js';

interface SourceRow {
  id: string;
  source_type: string;
  content: string;
  metadata: string | null;
  user_id: string | null;
  agent_id: string | null;
  run_id: string | null;
  actor_id: string | null;
  created_at: string;
}

function rowToRecord(row: SourceRow): SourceRecord {
  return {
    id: String(row.id),
    sourceType: row.source_type,
    content: row.content,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    userId: row.user_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    runId: row.run_id ?? undefined,
    actorId: row.actor_id ?? undefined,
    createdAt: row.created_at,
  };
}

export interface SQLiteSourceStoreOptions {
  /** better-sqlite3 Database instance to reuse (e.g. shared with SQLiteStore). */
  db?: Database.Database;
  /** File path; defaults to ':memory:'. Ignored when `db` is provided. */
  path?: string;
}

export class SQLiteSourceStore implements SourceStoreBase {
  private readonly db: Database.Database;
  private readonly ownsDb: boolean;

  constructor(options: SQLiteSourceStoreOptions = {}) {
    if (options.db) {
      this.db = options.db;
      this.ownsDb = false;
    } else {
      this.db = new Database(options.path ?? ':memory:');
      this.ownsDb = true;
    }
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        user_id TEXT,
        agent_id TEXT,
        run_id TEXT,
        actor_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_memory_links (
        source_id TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_id, memory_id)
      );
      CREATE TABLE IF NOT EXISTS source_skill_links (
        source_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_id, skill_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
      CREATE INDEX IF NOT EXISTS idx_sources_agent ON sources(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sources_run ON sources(run_id);
      CREATE INDEX IF NOT EXISTS idx_links_memory ON source_memory_links(memory_id);
      CREATE INDEX IF NOT EXISTS idx_links_skill ON source_skill_links(skill_id);
    `);
  }

  async createTable(): Promise<void> {
    // Migration runs in the constructor; this method exists to honour the
    // SourceStoreBase contract for parity with Python `create_table()`.
  }

  async createSource(params: {
    sourceType: string;
    content: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    agentId?: string;
    runId?: string;
    actorId?: string;
  }): Promise<SourceRecord> {
    const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sources (id, source_type, content, metadata, user_id, agent_id, run_id, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.sourceType,
      params.content,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.userId ?? null,
      params.agentId ?? null,
      params.runId ?? null,
      params.actorId ?? null,
      createdAt,
    );
    return {
      id,
      sourceType: params.sourceType,
      content: params.content,
      metadata: params.metadata,
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
      actorId: params.actorId,
      createdAt,
    };
  }

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId) as SourceRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async linkMemory(sourceId: string, memoryId: string): Promise<boolean> {
    const createdAt = new Date().toISOString();
    const info = this.db.prepare(`
      INSERT OR IGNORE INTO source_memory_links (source_id, memory_id, created_at)
      VALUES (?, ?, ?)
    `).run(sourceId, memoryId, createdAt);
    return info.changes > 0;
  }

  async unlinkMemory(sourceId: string, memoryId: string): Promise<boolean> {
    const info = this.db.prepare(`
      DELETE FROM source_memory_links WHERE source_id = ? AND memory_id = ?
    `).run(sourceId, memoryId);
    return info.changes > 0;
  }

  async getSourcesForMemory(memoryId: string): Promise<SourceRecord[]> {
    const rows = this.db.prepare(`
      SELECT s.* FROM sources s
      JOIN source_memory_links l ON l.source_id = s.id
      WHERE l.memory_id = ?
      ORDER BY l.created_at ASC
    `).all(memoryId) as SourceRow[];
    return rows.map(rowToRecord);
  }

  async linkSkill(sourceId: string, skillId: string): Promise<boolean> {
    const createdAt = new Date().toISOString();
    const info = this.db.prepare(`
      INSERT OR IGNORE INTO source_skill_links (source_id, skill_id, created_at)
      VALUES (?, ?, ?)
    `).run(sourceId, skillId, createdAt);
    return info.changes > 0;
  }

  async unlinkSkill(sourceId: string, skillId: string): Promise<boolean> {
    const info = this.db.prepare(`
      DELETE FROM source_skill_links WHERE source_id = ? AND skill_id = ?
    `).run(sourceId, skillId);
    return info.changes > 0;
  }

  async getSourcesForSkill(skillId: string): Promise<SourceRecord[]> {
    const rows = this.db.prepare(`
      SELECT s.* FROM sources s
      JOIN source_skill_links l ON l.source_id = s.id
      WHERE l.skill_id = ?
      ORDER BY l.created_at ASC
    `).all(skillId) as SourceRow[];
    return rows.map(rowToRecord);
  }

  async getMemoriesForSource(sourceId: string): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT memory_id FROM source_memory_links WHERE source_id = ?
      ORDER BY created_at ASC
    `).all(sourceId) as Array<{ memory_id: string }>;
    return rows.map((r) => r.memory_id);
  }

  async getSkillsForSource(sourceId: string): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT skill_id FROM source_skill_links WHERE source_id = ?
      ORDER BY created_at ASC
    `).all(sourceId) as Array<{ skill_id: string }>;
    return rows.map((r) => r.skill_id);
  }

  async deleteSource(sourceId: string): Promise<boolean> {
    const info = this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
    if (info.changes > 0) {
      this.db.prepare('DELETE FROM source_memory_links WHERE source_id = ?').run(sourceId);
      this.db.prepare('DELETE FROM source_skill_links WHERE source_id = ?').run(sourceId);
      return true;
    }
    return false;
  }

  async close(): Promise<void> {
    if (this.ownsDb) this.db.close();
  }
}
