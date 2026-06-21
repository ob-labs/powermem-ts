/**
 * SQLiteSkillStore — SQLite-backed implementation of SkillStoreBase.
 *
 * Round 5 implementation. Python upstream ships an OceanBase-only concrete
 * implementation; TS ships a portable SQLite-backed implementation so skill
 * creation / search / status update can be exercised locally without a real
 * OceanBase cluster. OceanBase parity is provided via the abstract
 * SkillStoreBase interface.
 *
 * Schema:
 *   - skills(id, title, description, tags, procedure_data, title_vector,
 *            description_vector, user_id, agent_id, status, created_at,
 *            updated_at)
 *
 * Search supports both vector (cosine similarity over title_vector) and
 * fulltext (LIKE over title + description) modes.
 */
import Database from 'better-sqlite3';
import { cosineSimilarity } from '../../utils/search.js';
import type { SkillRecord, SkillSearchParams, SkillSearchHit, SkillStoreBase } from './base.js';

interface SkillRow {
  id: string;
  title: string;
  description: string;
  tags: string | null;
  procedure_data: string | null;
  title_vector: string | null;
  description_vector: string | null;
  user_id: string | null;
  agent_id: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: SkillRow): SkillRecord {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    procedureData: row.procedure_data ? (JSON.parse(row.procedure_data) as Record<string, unknown>) : undefined,
    titleEmbedding: row.title_vector ? (JSON.parse(row.title_vector) as number[]) : undefined,
    descriptionEmbedding: row.description_vector ? (JSON.parse(row.description_vector) as number[]) : undefined,
    userId: row.user_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    status: row.status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SQLiteSkillStoreOptions {
  db?: Database.Database;
  path?: string;
}

export class SQLiteSkillStore implements SkillStoreBase {
  private readonly db: Database.Database;
  private readonly ownsDb: boolean;

  constructor(options: SQLiteSkillStoreOptions = {}) {
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
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT,
        procedure_data TEXT,
        title_vector TEXT,
        description_vector TEXT,
        user_id TEXT,
        agent_id TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);
      CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills(agent_id);
      CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
    `);
  }

  async createTable(): Promise<void> {
    // Migration runs in the constructor.
  }

  async add(params: {
    title: string;
    description: string;
    tags?: string[];
    procedureData?: Record<string, unknown>;
    titleEmbedding?: number[];
    descriptionEmbedding?: number[];
    userId?: string;
    agentId?: string;
  }): Promise<SkillRecord> {
    const id = `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO skills (id, title, description, tags, procedure_data, title_vector, description_vector, user_id, agent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id,
      params.title,
      params.description,
      params.tags ? JSON.stringify(params.tags) : null,
      params.procedureData ? JSON.stringify(params.procedureData) : null,
      params.titleEmbedding ? JSON.stringify(params.titleEmbedding) : null,
      params.descriptionEmbedding ? JSON.stringify(params.descriptionEmbedding) : null,
      params.userId ?? null,
      params.agentId ?? null,
      now,
      now,
    );
    return {
      id,
      title: params.title,
      description: params.description,
      tags: params.tags,
      procedureData: params.procedureData,
      titleEmbedding: params.titleEmbedding,
      descriptionEmbedding: params.descriptionEmbedding,
      userId: params.userId,
      agentId: params.agentId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(params: {
    skillId: string;
    title?: string;
    description?: string;
    tags?: string[];
    procedureData?: Record<string, unknown>;
    titleEmbedding?: number[];
    descriptionEmbedding?: number[];
  }): Promise<boolean> {
    const existing = await this.get(params.skillId);
    if (!existing) return false;
    const now = new Date().toISOString();
    const title = params.title ?? existing.title;
    const description = params.description ?? existing.description;
    const tags = params.tags ?? existing.tags;
    const procedureData = params.procedureData ?? existing.procedureData;
    const titleVector = params.titleEmbedding ?? existing.titleEmbedding;
    const descVector = params.descriptionEmbedding ?? existing.descriptionEmbedding;
    const info = this.db.prepare(`
      UPDATE skills
      SET title = ?, description = ?, tags = ?, procedure_data = ?,
          title_vector = ?, description_vector = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title,
      description,
      tags ? JSON.stringify(tags) : null,
      procedureData ? JSON.stringify(procedureData) : null,
      titleVector ? JSON.stringify(titleVector) : null,
      descVector ? JSON.stringify(descVector) : null,
      now,
      params.skillId,
    );
    return info.changes > 0;
  }

  async get(skillId: string): Promise<SkillRecord | null> {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as SkillRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async search(params: SkillSearchParams): Promise<SkillSearchHit[]> {
    const limit = params.limit ?? 10;
    const conditions: string[] = [];
    const sqlParams: unknown[] = [];
    if (params.userId) {
      conditions.push('user_id = ?');
      sqlParams.push(params.userId);
    }
    if (params.agentId) {
      conditions.push('agent_id = ?');
      sqlParams.push(params.agentId);
    }
    if (params.statusFilter) {
      conditions.push('status = ?');
      sqlParams.push(params.statusFilter);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM skills ${where}`).all(...sqlParams) as SkillRow[];

    let hits: SkillSearchHit[] = rows.map((row) => ({ ...rowToRecord(row), score: 0 }));

    // Vector scoring
    if (params.queryEmbedding) {
      const queryVec = params.queryEmbedding;
      hits = hits.map((h) => {
        const storedVec = h.titleEmbedding;
        const score = storedVec ? cosineSimilarity(queryVec, storedVec) : 0;
        return { ...h, score };
      });
    }

    // Fulltext scoring on top (additive)
    if (params.queryText) {
      const q = params.queryText.toLowerCase();
      hits = hits.map((h) => {
        const text = `${h.title} ${h.description}`.toLowerCase();
        const match = text.includes(q) ? 0.1 : 0;
        return { ...h, score: h.score + match };
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  async updateStatus(skillId: string, status: string): Promise<boolean> {
    const now = new Date().toISOString();
    const info = this.db.prepare(`
      UPDATE skills SET status = ?, updated_at = ? WHERE id = ?
    `).run(status, now, skillId);
    return info.changes > 0;
  }

  async delete(skillId: string): Promise<boolean> {
    const info = this.db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
    return info.changes > 0;
  }

  async close(): Promise<void> {
    if (this.ownsDb) this.db.close();
  }
}
