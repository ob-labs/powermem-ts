/**
 * PgVectorStore — PostgreSQL + pgvector storage backend.
 * Requires: npm install pg
 *
 * Implements the VectorStore interface using PostgreSQL with the pgvector extension
 * for efficient vector similarity search.
 *
 * Configuration should be passed via `PgVectorStoreOptions`.
 */
import type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from '../base.js';
import { getCurrentDatetimeIsoformat } from '../../utils/payload-datetime.js';

export interface PgVectorStoreOptions {
  connectionString?: string;
  tableName?: string;
  dimensions?: number;
  dbname?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  sslmode?: string;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getUserMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function getScope(payload: Record<string, unknown>): string | undefined {
  const scope = getUserMetadata(payload).scope;
  return typeof scope === 'string' && scope.length > 0 ? scope : undefined;
}

function getAccessCount(payload: Record<string, unknown>): number {
  const accessCount = getUserMetadata(payload).access_count;
  return typeof accessCount === 'number' && Number.isFinite(accessCount)
    ? accessCount
    : ((payload.access_count as number) ?? 0);
}

export class PgVectorStore implements VectorStore {
  private pool: any; // pg.Pool — dynamically imported
  private readonly tableName: string;
  private readonly dimensions: number;
  private initialized = false;

  constructor(private readonly options: PgVectorStoreOptions = {}) {
    this.tableName = options.tableName ?? 'power_mem';
    this.dimensions = options.dimensions ?? 1536;
  }

  static async create(options: PgVectorStoreOptions = {}): Promise<PgVectorStore> {
    const store = new PgVectorStore(options);
    await store.init();
    return store;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    let pg: any;
    try {
      pg = await import('pg');
    } catch {
      throw new Error(
        'PgVectorStore requires the "pg" package. Install it: npm install pg'
      );
    }

    const Pool = pg.default?.Pool ?? pg.Pool;
    let connectionString = this.options.connectionString;
    if (!connectionString) {
      const host = this.options.host ?? '127.0.0.1';
      const port = this.options.port ?? 5432;
      const dbname = this.options.dbname ?? 'postgres';
      const user = this.options.user ?? 'postgres';
      const password = this.options.password ?? '';
      const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
      connectionString = `postgresql://${auth}@${host}:${port}/${dbname}`;
      if (this.options.sslmode) {
        connectionString += `?sslmode=${encodeURIComponent(this.options.sslmode)}`;
      }
    }

    this.pool = new Pool({ connectionString });

    // Enable pgvector extension and create table
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        embedding vector(${this.dimensions}),
        content TEXT,
        user_id TEXT,
        agent_id TEXT,
        run_id TEXT,
        actor_id TEXT,
        hash TEXT,
        scope TEXT,
        category TEXT,
        access_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create HNSW index for fast similarity search
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
      ON ${this.tableName} USING hnsw (embedding vector_cosine_ops)
    `).catch(() => { /* index may already exist with different params */ });

    // Indexes for common filters
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.tableName}_user_idx ON ${this.tableName} (user_id)`).catch(() => {});
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.tableName}_agent_idx ON ${this.tableName} (agent_id)`).catch(() => {});

    this.initialized = true;
  }

  private buildWhere(filters: VectorStoreFilter): { clause: string; params: unknown[]; paramIdx: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.userId) { conditions.push(`user_id = $${idx++}`); params.push(filters.userId); }
    if (filters.agentId) { conditions.push(`agent_id = $${idx++}`); params.push(filters.agentId); }
    if (filters.runId) { conditions.push(`run_id = $${idx++}`); params.push(filters.runId); }
    if (filters.actorId) { conditions.push(`actor_id = $${idx++}`); params.push(filters.actorId); }
    if (filters.scope) { conditions.push(`scope = $${idx++}`); params.push(filters.scope); }
    if (filters.category) { conditions.push(`category = $${idx++}`); params.push(filters.category); }

    return {
      clause: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
      params,
      paramIdx: idx,
    };
  }

  private rowToRecord(row: any): VectorStoreRecord {
    const payload = parseJsonObject(row.payload);
    const metadata = parseJsonObject(row.metadata);
    return {
      id: row.id,
      content: row.content ?? '',
      userId: row.user_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      runId: row.run_id ?? undefined,
      actorId: row.actor_id ?? (payload.actor_id as string | undefined),
      hash: row.hash ?? undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : (payload.metadata as Record<string, unknown> | undefined) ?? {},
      embedding: row.embedding ? JSON.parse(`[${row.embedding.slice(1, -1)}]`) : undefined,
      createdAt: row.created_at?.toISOString?.() ?? row.created_at,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
      scope: row.scope ?? getScope(payload),
      category: row.category ?? undefined,
      accessCount: row.access_count ?? getAccessCount(payload),
    };
  }

  async insert(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.init();
    const vecStr = `[${vector.join(',')}]`;
    await this.pool.query(
      `INSERT INTO ${this.tableName} (id, embedding, content, user_id, agent_id, run_id, actor_id, hash, scope, category, access_count, metadata, payload, created_at, updated_at)
       VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         embedding = $2::vector,
         content = $3,
         user_id = $4,
         agent_id = $5,
         run_id = $6,
         actor_id = $7,
         hash = $8,
         scope = $9,
         category = $10,
         access_count = $11,
         metadata = $12,
         payload = $13,
         created_at = $14,
         updated_at = $15`,
      [
        id, vecStr,
        payload.data ?? '', payload.user_id ?? null, payload.agent_id ?? null,
        payload.run_id ?? null, payload.actor_id ?? null, payload.hash ?? null,
        ((payload.metadata as Record<string, unknown> | undefined)?.scope as string | undefined) ?? null,
        payload.category ?? null,
        getAccessCount(payload),
        JSON.stringify(payload.metadata ?? {}), JSON.stringify(payload),
        payload.created_at ?? getCurrentDatetimeIsoformat(),
        payload.updated_at ?? getCurrentDatetimeIsoformat(),
      ]
    );
  }

  async getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    await this.init();
    let query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const params: unknown[] = [id];
    if (userId) { query += ` AND user_id = $${params.length + 1}`; params.push(userId); }
    if (agentId) { query += ` AND agent_id = $${params.length + 1}`; params.push(agentId); }
    const { rows } = await this.pool.query(query, params);
    return rows.length > 0 ? this.rowToRecord(rows[0]) : null;
  }

  async update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.init();
    const vecStr = `[${vector.join(',')}]`;
    await this.pool.query(
      `UPDATE ${this.tableName}
       SET embedding = $1::vector,
           content = $2,
           user_id = $3,
           agent_id = $4,
           run_id = $5,
           actor_id = $6,
           hash = $7,
           scope = $8,
           category = $9,
           access_count = $10,
           metadata = $11,
           payload = $12,
           updated_at = $13
       WHERE id = $14`,
      [
        vecStr,
        payload.data ?? '',
        payload.user_id ?? null,
        payload.agent_id ?? null,
        payload.run_id ?? null,
        payload.actor_id ?? null,
        payload.hash ?? null,
        ((payload.metadata as Record<string, unknown> | undefined)?.scope as string | undefined) ?? null,
        payload.category ?? null,
        getAccessCount(payload),
        JSON.stringify(payload.metadata ?? {}),
        JSON.stringify(payload),
        payload.updated_at ?? getCurrentDatetimeIsoformat(),
        id,
      ]
    );
  }

  async remove(id: string): Promise<boolean> {
    await this.init();
    const { rowCount } = await this.pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  async list(filters: VectorStoreFilter = {}, limit = 100, offset = 0, options: VectorStoreListOptions = {}): Promise<{ records: VectorStoreRecord[]; total: number }> {
    await this.init();
    const { clause, params, paramIdx } = this.buildWhere(filters);
    let idx = paramIdx;

    const countRes = await this.pool.query(`SELECT COUNT(*) as cnt FROM ${this.tableName}${clause}`, params);
    const total = parseInt(countRes.rows[0].cnt, 10);

    const sortCol = options.sortBy === 'created_at' ? 'created_at' : options.sortBy === 'updated_at' ? 'updated_at' : 'created_at';
    const dir = options.order === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.tableName}${clause} ORDER BY ${sortCol} ${dir} LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { records: rows.map((r: any) => this.rowToRecord(r)), total };
  }

  async search(queryVector: number[], filters: VectorStoreFilter = {}, limit = 30): Promise<VectorStoreSearchMatch[]> {
    await this.init();
    const { clause, params, paramIdx } = this.buildWhere(filters);
    const vecStr = `[${queryVector.join(',')}]`;

    // pgvector cosine distance: 1 - (a <=> b) gives similarity
    const { rows } = await this.pool.query(
      `SELECT id, content, user_id, agent_id, run_id, actor_id, category, scope, metadata, payload, created_at, updated_at, access_count,
              1 - (embedding <=> $${paramIdx}::vector) AS score
       FROM ${this.tableName}${clause.length > 0 ? clause + ' AND' : ' WHERE'} embedding IS NOT NULL
       ORDER BY embedding <=> $${paramIdx}::vector
       LIMIT $${paramIdx + 1}`,
      [...params, vecStr, limit]
    );

    return rows.map((r: any) => {
      const payload = parseJsonObject(r.payload);
      const metadata = parseJsonObject(r.metadata);
      return {
        id: r.id,
        content: r.content ?? '',
        score: parseFloat(r.score),
        userId: r.user_id ?? undefined,
        agentId: r.agent_id ?? undefined,
        runId: r.run_id ?? undefined,
        actorId: r.actor_id ?? undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : (payload.metadata as Record<string, unknown> | undefined),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
        scope: r.scope ?? getScope(payload),
        category: r.category ?? undefined,
        accessCount: r.access_count ?? getAccessCount(payload),
      };
    });
  }

  async count(filters: VectorStoreFilter = {}): Promise<number> {
    await this.init();
    const { clause, params } = this.buildWhere(filters);
    const { rows } = await this.pool.query(`SELECT COUNT(*) as cnt FROM ${this.tableName}${clause}`, params);
    return parseInt(rows[0].cnt, 10);
  }

  async incrementAccessCount(id: string): Promise<void> {
    await this.init();
    await this.pool.query(
      `UPDATE ${this.tableName}
       SET access_count = access_count + 1,
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{access_count}',
             to_jsonb(COALESCE((metadata->>'access_count')::integer, 0) + 1),
             true
           ),
           payload = jsonb_set(
             COALESCE(payload, '{}'::jsonb),
             '{metadata,access_count}',
             to_jsonb(COALESCE((payload->'metadata'->>'access_count')::integer, 0) + 1),
             true
           )
       WHERE id = $1`,
      [id],
    );
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.init();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await this.pool.query(
      `UPDATE ${this.tableName}
       SET access_count = access_count + 1,
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{access_count}',
             to_jsonb(COALESCE((metadata->>'access_count')::integer, 0) + 1),
             true
           ),
           payload = jsonb_set(
             COALESCE(payload, '{}'::jsonb),
             '{metadata,access_count}',
             to_jsonb(COALESCE((payload->'metadata'->>'access_count')::integer, 0) + 1),
             true
           )
       WHERE id IN (${placeholders})`,
      ids,
    );
  }

  async removeAll(filters: VectorStoreFilter = {}): Promise<void> {
    await this.init();
    const { clause, params } = this.buildWhere(filters);
    await this.pool.query(`DELETE FROM ${this.tableName}${clause}`, params);
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}
