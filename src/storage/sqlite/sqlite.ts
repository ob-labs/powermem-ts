import Database from 'better-sqlite3';
import { cosineSimilarity } from '../../utils/search.js';
import type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from '../base.js';

// Re-export for backward compatibility
export type StoreRecord = VectorStoreRecord;
export type StoreFilter = VectorStoreFilter;
export type SearchMatch = VectorStoreSearchMatch;

const SORTABLE_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'data', 'access_count', 'category', 'scope',
]);

export class SQLiteStore implements VectorStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        vector TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private toRecord(row: { id: string; vector: string; payload: string; created_at: string }): VectorStoreRecord {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const vector = row.vector ? (JSON.parse(row.vector) as number[]) : undefined;
    return {
      id: String(row.id),
      content: (payload.data as string) ?? '',
      userId: payload.user_id as string | undefined,
      agentId: payload.agent_id as string | undefined,
      runId: payload.run_id as string | undefined,
      hash: payload.hash as string | undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
      embedding: vector,
      createdAt: (payload.created_at as string) ?? row.created_at,
      updatedAt: (payload.updated_at as string) ?? row.created_at,
      scope: payload.scope as string | undefined,
      category: payload.category as string | undefined,
      accessCount: (payload.access_count as number) ?? 0,
    };
  }

  async insert(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    const stmt = this.db.prepare('INSERT INTO memories (id, vector, payload) VALUES (?, ?, ?)');
    stmt.run(id, JSON.stringify(vector), JSON.stringify(payload));
  }

  async getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      | { id: string; vector: string; payload: string; created_at: string }
      | undefined;
    if (!row) return null;

    const record = this.toRecord(row);
    if (userId && record.userId !== userId) return null;
    if (agentId && record.agentId !== agentId) return null;
    return record;
  }

  async update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    const stmt = this.db.prepare('UPDATE memories SET vector = ?, payload = ? WHERE id = ?');
    stmt.run(JSON.stringify(vector), JSON.stringify(payload), id);
  }

  async remove(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async list(
    filters: VectorStoreFilter = {},
    limit = 100,
    offset = 0,
    options: VectorStoreListOptions = {}
  ): Promise<{ records: VectorStoreRecord[]; total: number }> {
    const { where, params } = this.buildWhereClause(filters);

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM memories${where}`)
      .get(...params) as { cnt: number };

    let orderClause = 'ORDER BY id DESC';
    if (options.sortBy) {
      const direction = options.order === 'asc' ? 'ASC' : 'DESC';
      if (options.sortBy === 'id') {
        orderClause = `ORDER BY id ${direction}`;
      } else if (SORTABLE_FIELDS.has(options.sortBy)) {
        orderClause = `ORDER BY json_extract(payload, '$.${options.sortBy}') ${direction}`;
      }
    }

    const rows = this.db
      .prepare(`SELECT * FROM memories${where} ${orderClause} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<{
      id: string;
      vector: string;
      payload: string;
      created_at: string;
    }>;

    return { records: rows.map((r) => this.toRecord(r)), total: countRow.cnt };
  }

  async search(queryVector: number[], filters: VectorStoreFilter = {}, limit = 30): Promise<VectorStoreSearchMatch[]> {
    const { where, params } = this.buildWhereClause(filters);

    const rows = this.db
      .prepare(`SELECT id, vector, payload FROM memories${where}`)
      .all(...params) as Array<{ id: string; vector: string; payload: string }>;

    const scored: VectorStoreSearchMatch[] = [];
    for (const row of rows) {
      if (!row.vector) continue;
      const vec = JSON.parse(row.vector) as number[];
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const score = cosineSimilarity(queryVector, vec);
      scored.push({
        id: String(row.id),
        content: (payload.data as string) ?? '',
        score,
        metadata: payload.metadata as Record<string, unknown> | undefined,
        createdAt: payload.created_at as string | undefined,
        updatedAt: payload.updated_at as string | undefined,
        accessCount: (payload.access_count as number) ?? 0,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async count(filters: VectorStoreFilter = {}): Promise<number> {
    const { where, params } = this.buildWhereClause(filters);
    const row = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM memories${where}`)
      .get(...params) as { cnt: number };
    return row.cnt;
  }

  async incrementAccessCount(id: string): Promise<void> {
    this.db.prepare(`
      UPDATE memories
      SET payload = json_set(payload, '$.access_count',
        COALESCE(json_extract(payload, '$.access_count'), 0) + 1
      )
      WHERE id = ?
    `).run(id);
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`
      UPDATE memories
      SET payload = json_set(payload, '$.access_count',
        COALESCE(json_extract(payload, '$.access_count'), 0) + 1
      )
      WHERE id IN (${placeholders})
    `).run(...ids);
  }

  async removeAll(filters: VectorStoreFilter = {}): Promise<void> {
    const { where, params } = this.buildWhereClause(filters);
    this.db.prepare(`DELETE FROM memories${where}`).run(...params);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private buildWhereClause(filters: VectorStoreFilter): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.userId) {
      conditions.push("json_extract(payload, '$.user_id') = ?");
      params.push(filters.userId);
    }
    if (filters.agentId) {
      conditions.push("json_extract(payload, '$.agent_id') = ?");
      params.push(filters.agentId);
    }
    if (filters.runId) {
      conditions.push("json_extract(payload, '$.run_id') = ?");
      params.push(filters.runId);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }
}
