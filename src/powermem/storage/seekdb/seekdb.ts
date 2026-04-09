import type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from '../base.js';
import path from 'node:path';

export interface SeekDBStoreOptions {
  path: string;
  database?: string;
  collectionName?: string;
  distance?: 'cosine' | 'l2' | 'inner_product';
  dimension?: number;
}

export class SeekDBStore implements VectorStore {
  private static readonly sharedClients = new Map<string, { client: any; refCount: number }>();

  private client: any;

  private collection: any;

  private tableName: string;

  private readonly distanceMetric: 'cosine' | 'l2' | 'inner_product';

  private readonly clientKey: string;

  private isClosed = false;

  private constructor(
    client: any,
    collection: any,
    tableName: string,
    distanceMetric: 'cosine' | 'l2' | 'inner_product',
    clientKey: string,
  ) {
    this.client = client;
    this.collection = collection;
    this.tableName = tableName;
    this.distanceMetric = distanceMetric;
    this.clientKey = clientKey;
  }

  private static buildClientKey(dbPath: string, database: string): string {
    return `${path.resolve(dbPath)}::${database}`;
  }

  private static acquireClient(dbPath: string, database: string, SeekdbClient: any): { client: any; key: string } {
    const key = SeekDBStore.buildClientKey(dbPath, database);
    const existing = SeekDBStore.sharedClients.get(key);
    if (existing) {
      existing.refCount += 1;
      return { client: existing.client, key };
    }

    const client = new SeekdbClient({ path: dbPath, database });
    SeekDBStore.sharedClients.set(key, { client, refCount: 1 });
    return { client, key };
  }

  private static async releaseClient(key: string): Promise<void> {
    const entry = SeekDBStore.sharedClients.get(key);
    if (!entry) return;

    entry.refCount -= 1;
    if (entry.refCount > 0) return;

    SeekDBStore.sharedClients.delete(key);
    await entry.client?.close?.();
  }

  private static async resolveCollection(client: any, options: { name: string; schema: any }): Promise<any> {
    if (typeof client.getOrCreateCollection === 'function') {
      return client.getOrCreateCollection(options);
    }
    if (typeof client.getCollection === 'function') {
      try {
        return await client.getCollection({ name: options.name });
      } catch {
        // Fall through to createCollection.
      }
    }
    if (typeof client.createCollection === 'function') {
      return client.createCollection(options);
    }
    throw new Error('seekdb client does not expose a supported collection creation API.');
  }

  static async create(options: SeekDBStoreOptions): Promise<SeekDBStore> {
    const {
      SeekdbClient,
      Schema,
      VectorIndexConfig,
      FulltextIndexConfig,
      SparseVectorIndexConfig,
    } = await import('seekdb') as any;

    const database = options.database ?? 'test';
    const { client, key } = SeekDBStore.acquireClient(options.path, database, SeekdbClient);

    const dimension = options.dimension ?? 768;
    const distance = options.distance ?? 'l2';

    try {
      const schema = new Schema({
        fulltextIndex: new FulltextIndexConfig(),
        vectorIndex: new VectorIndexConfig({
          hnsw: { dimension, distance },
          embeddingFunction: null, // We pass pre-computed embeddings, no auto-vectorization
        }),
        sparseVectorIndex: new SparseVectorIndexConfig({
          distance: 'inner_product',
          type: 'sindi',
        }),
      });

      const collection = await SeekDBStore.resolveCollection(client, {
        name: options.collectionName ?? 'power_mem',
        schema,
      });
      const collectionId = collection?.collectionId as string | undefined;
      if (!collectionId) {
        throw new Error('seekdb collection did not expose collectionId for SQL-backed operations.');
      }

      return new SeekDBStore(
        client,
        collection,
        `c$v2$${collectionId}`,
        distance,
        key,
      );
    } catch (error) {
      await SeekDBStore.releaseClient(key);
      throw error;
    }
  }

  // ─── Distance → Score conversion ─────────────────────────────────────

  /**
   * Convert distance to similarity score (0–1, higher = more similar).
   * Formula depends on the configured distance metric, matching Python's OceanBase implementation.
   */
  private distanceToScore(distance: number): number {
    if (distance == null) return 0;

    switch (this.distanceMetric) {
      case 'l2':
        // L2: smaller distance = more similar → 1 / (1 + distance)
        return 1 / (1 + Math.abs(distance));

      case 'cosine':
        // Cosine distance range [0, 2] → max(0, 1 - distance / 2)
        return Math.max(0, 1 - distance / 2);

      case 'inner_product': {
        // Inner product returned as negative distance → negate, then (ip + 1) / 2, clamped to [0, 1]
        const innerProd = -distance;
        return Math.max(0, Math.min(1, (innerProd + 1) / 2));
      }

      default:
        return 0;
    }
  }

  // ─── Payload ↔ SQL/JSON mapping ──────────────────────────────────────
  private normalizeUserMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Record<string, unknown>) };
  }

  private serializePayloadMetadata(payload: Record<string, unknown>): string {
    return JSON.stringify({
      user_id: (payload.user_id as string) ?? '',
      agent_id: (payload.agent_id as string) ?? '',
      run_id: (payload.run_id as string) ?? '',
      actor_id: (payload.actor_id as string) ?? '',
      hash: (payload.hash as string) ?? '',
      created_at: (payload.created_at as string) ?? '',
      updated_at: (payload.updated_at as string) ?? '',
      category: (payload.category as string) ?? '',
      fulltext_content: (payload.fulltext_content as string) ?? (payload.data as string) ?? '',
      metadata: this.normalizeUserMetadata(payload.metadata),
    });
  }

  private parseStoredMetadata(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return {};
      }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return {};
  }

  private getUserMetadata(metadata: Record<string, any>): Record<string, unknown> {
    return this.normalizeUserMetadata(metadata.metadata);
  }

  private getScope(metadata: Record<string, any>): string | undefined {
    const scope = this.getUserMetadata(metadata).scope;
    return typeof scope === 'string' && scope.length > 0 ? scope : undefined;
  }

  private getAccessCount(metadata: Record<string, any>): number {
    const accessCount = this.getUserMetadata(metadata).access_count;
    return typeof accessCount === 'number' && Number.isFinite(accessCount) ? accessCount : 0;
  }

  private parseEmbedding(value: unknown): number[] | undefined {
    if (Array.isArray(value)) return value as number[];
    if (typeof value === 'string' && value.length > 0) {
      try {
        return JSON.parse(value) as number[];
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private toRecordFromRow(row: {
    _id: string;
    document?: string | null;
    metadata?: unknown;
    embedding?: unknown;
  }): VectorStoreRecord {
    const metadata = this.parseStoredMetadata(row.metadata);
    const userMetadata = this.getUserMetadata(metadata);
    return {
      id: String(row._id),
      content: row.document ?? '',
      userId: metadata.user_id || undefined,
      agentId: metadata.agent_id || undefined,
      runId: metadata.run_id || undefined,
      actorId: metadata.actor_id || undefined,
      hash: metadata.hash || undefined,
      metadata: userMetadata,
      embedding: this.parseEmbedding(row.embedding),
      createdAt: metadata.created_at || new Date().toISOString(),
      updatedAt: metadata.updated_at || new Date().toISOString(),
      scope: this.getScope(metadata),
      category: metadata.category || undefined,
      accessCount: this.getAccessCount(metadata),
    };
  }

  private toSearchMatch(
    id: string,
    document: string | null,
    metadataValue: Record<string, any> | null,
    score: number,
    systemScores: Record<string, unknown> = {},
  ): VectorStoreSearchMatch {
    const metadata = this.parseStoredMetadata(metadataValue);
    const userMetadata = this.getUserMetadata(metadata);
    return {
      id,
      content: document ?? '',
      score,
      userId: metadata.user_id || undefined,
      agentId: metadata.agent_id || undefined,
      runId: metadata.run_id || undefined,
      actorId: metadata.actor_id || undefined,
      metadata: {
        ...userMetadata,
        ...(metadata.category ? { category: metadata.category } : {}),
        ...systemScores,
      },
      createdAt: metadata.created_at || undefined,
      updatedAt: metadata.updated_at || undefined,
      scope: this.getScope(metadata),
      category: metadata.category || undefined,
      accessCount: this.getAccessCount(metadata),
    };
  }

  private buildQueryWhereClause(filters: VectorStoreFilter): Record<string, any> | null {
    const conditions: Record<string, any>[] = [];
    if (filters.userId) conditions.push({ user_id: { $eq: filters.userId } });
    if (filters.agentId) conditions.push({ agent_id: { $eq: filters.agentId } });
    if (filters.runId) conditions.push({ run_id: { $eq: filters.runId } });
    if (filters.actorId) conditions.push({ actor_id: { $eq: filters.actorId } });
    if (filters.category) conditions.push({ category: { $eq: filters.category } });

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  private buildSqlWhere(filters: VectorStoreFilter): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.userId) {
      conditions.push("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.user_id')) = ?");
      params.push(filters.userId);
    }
    if (filters.agentId) {
      conditions.push("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.agent_id')) = ?");
      params.push(filters.agentId);
    }
    if (filters.runId) {
      conditions.push("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.run_id')) = ?");
      params.push(filters.runId);
    }
    if (filters.actorId) {
      conditions.push("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.actor_id')) = ?");
      params.push(filters.actorId);
    }
    if (filters.category) {
      conditions.push("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.category')) = ?");
      params.push(filters.category);
    }
    return {
      clause: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  private async selectRows(
    filters: VectorStoreFilter = {},
    columns = '_id, document, embedding, metadata',
  ): Promise<Array<{ _id: string; document?: string | null; embedding?: unknown; metadata?: unknown }>> {
    const { clause, params } = this.buildSqlWhere(filters);
    return await this.client.execute(
      `SELECT ${columns} FROM \`${this.tableName}\`${clause}`,
      params,
    ) as Array<{ _id: string; document?: string | null; embedding?: unknown; metadata?: unknown }>;
  }

  private applyScopeFilter<T extends { scope?: string }>(items: T[], filters: VectorStoreFilter): T[] {
    if (!filters.scope) return items;
    return items.filter((item) => item.scope === filters.scope);
  }

  private unwrapResultArray<T>(value: T[] | T[][] | undefined): T[] {
    if (!Array.isArray(value)) return [];
    if (value.length > 0 && Array.isArray(value[0])) {
      return value[0] as T[];
    }
    return value as T[];
  }

  private normalizeScores(rawScores: number[]): number[] {
    if (rawScores.length === 0) return [];
    const maxScore = Math.max(...rawScores);
    const minScore = Math.min(...rawScores);
    const range = maxScore - minScore;
    if (range === 0) {
      return rawScores.map(() => 1);
    }
    return rawScores.map((score) => (score - minScore) / range);
  }

  private async nativeFullTextSearch(
    queryText: string,
    filters: VectorStoreFilter,
    limit: number,
  ): Promise<VectorStoreSearchMatch[]> {
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) return [];

    const where = this.buildQueryWhereClause(filters);
    const queryLimit = filters.scope ? Math.max(limit * 5, limit) : limit;
    const result = await this.collection.hybridSearch({
      query: {
        whereDocument: { $contains: trimmedQuery },
        ...(where ? { where } : {}),
      },
      nResults: queryLimit,
      include: ['documents', 'metadatas', 'distances'],
    });

    const ids = this.unwrapResultArray<string>(result.ids);
    if (ids.length === 0) return [];

    const documents = this.unwrapResultArray<string | null>(result.documents);
    const metadatas = this.unwrapResultArray<Record<string, any> | null>(result.metadatas);
    const rawScores = this.unwrapResultArray<number>(result.distances).map((value) => Number(value ?? 0));
    const normalizedScores = this.normalizeScores(rawScores);

    const matches: VectorStoreSearchMatch[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const metadata = metadatas[i] ?? {};
      const score = normalizedScores[i] ?? 0;
      matches.push(this.toSearchMatch(
        ids[i],
        documents[i] ?? '',
        metadata,
        score,
        {
          _fts_score: score,
          _quality_score: score,
          _native_fts_score: rawScores[i] ?? 0,
        },
      ));
    }

    matches.sort((a, b) => b.score - a.score);
    return this.applyScopeFilter(matches, filters).slice(0, limit);
  }

  private fuseHybridResults(
    vectorResults: VectorStoreSearchMatch[],
    textResults: VectorStoreSearchMatch[],
    limit: number,
  ): VectorStoreSearchMatch[] {
    const rrfK = 60;
    const weights = {
      vector: vectorResults.length > 0 ? 0.5 : 0,
      text: textResults.length > 0 ? 0.5 : 0,
    };
    const weightSum = weights.vector + weights.text || 1;

    type RankedEntry = {
      base: VectorStoreSearchMatch;
      vectorScore?: number;
      textScore?: number;
      vectorRank?: number;
      textRank?: number;
    };
    const combined = new Map<string, RankedEntry>();

    const register = (
      result: VectorStoreSearchMatch,
      kind: 'vector' | 'text',
      rank: number,
      score: number,
    ): void => {
      const entry = combined.get(result.id) ?? { base: result };
      if (!combined.has(result.id)) {
        combined.set(result.id, entry);
      }
      if (kind === 'vector') {
        entry.vectorScore = score;
        entry.vectorRank = rank;
      } else {
        entry.textScore = score;
        entry.textRank = rank;
      }
      if ((result.score ?? 0) > (entry.base.score ?? 0)) {
        entry.base = {
          ...entry.base,
          ...result,
          metadata: {
            ...(entry.base.metadata ?? {}),
            ...(result.metadata ?? {}),
          },
        };
      } else if (result.metadata) {
        entry.base.metadata = {
          ...(entry.base.metadata ?? {}),
          ...result.metadata,
        };
      }
    };

    vectorResults.forEach((result, index) => register(result, 'vector', index + 1, result.score));
    textResults.forEach((result, index) => register(result, 'text', index + 1, result.score));

    const fused = Array.from(combined.values()).map((entry) => {
      const fusionScore = (
        (entry.vectorRank ? weights.vector / (rrfK + entry.vectorRank) : 0) +
        (entry.textRank ? weights.text / (rrfK + entry.textRank) : 0)
      ) / weightSum;

      const qualityScore = (
        (entry.vectorScore ?? 0) * weights.vector +
        (entry.textScore ?? 0) * weights.text
      ) / weightSum;

      return {
        ...entry.base,
        score: fusionScore,
        metadata: {
          ...(entry.base.metadata ?? {}),
          _vector_similarity: entry.vectorScore,
          _fts_score: entry.textScore,
          _quality_score: qualityScore,
          _fusion_score: fusionScore,
        },
      };
    });

    fused.sort((a, b) => b.score - a.score);
    return fused.slice(0, limit);
  }

  // ─── VectorStore interface ───────────────────────────────────────────

  async insert(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.client.execute(
      `INSERT INTO \`${this.tableName}\` (_id, document, embedding, metadata) VALUES (?, ?, ?, ?)`,
      [
        id,
        (payload.data as string) ?? '',
        JSON.stringify(vector),
        this.serializePayloadMetadata(payload),
      ],
    );
  }

  async getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    const rows = await this.client.execute(
      `SELECT _id, document, embedding, metadata FROM \`${this.tableName}\` WHERE _id = ? LIMIT 1`,
      [id],
    ) as Array<{ _id: string; document?: string | null; embedding?: unknown; metadata?: unknown }>;
    if (rows.length === 0) return null;

    const record = this.toRecordFromRow(rows[0]);

    if (userId && record.userId !== userId) return null;
    if (agentId && record.agentId !== agentId) return null;
    return record;
  }

  async update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.client.execute(
      `UPDATE \`${this.tableName}\` SET document = ?, embedding = ?, metadata = ? WHERE _id = ?`,
      [
        (payload.data as string) ?? '',
        JSON.stringify(vector),
        this.serializePayloadMetadata(payload),
        id,
      ],
    );
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.client.execute(
      `SELECT _id FROM \`${this.tableName}\` WHERE _id = ? LIMIT 1`,
      [id],
    ) as Array<{ _id: string }>;
    if (existing.length === 0) return false;

    const result = await this.client.execute(
      `DELETE FROM \`${this.tableName}\` WHERE _id = ?`,
      [id],
    ) as Array<{ affected_rows?: number }>;
    if (Array.isArray(result) && result.length > 0 && typeof result[0]?.affected_rows === 'number') {
      return result[0].affected_rows > 0;
    }
    return true;
  }

  async list(
    filters: VectorStoreFilter = {},
    limit = 100,
    offset = 0,
    options: VectorStoreListOptions = {}
  ): Promise<{ records: VectorStoreRecord[]; total: number }> {
    let records = (await this.selectRows(filters)).map((row) => this.toRecordFromRow(row));
    records = this.applyScopeFilter(records, filters);
    const total = records.length;

    // Client-side sorting (seekdb get() has no ORDER BY)
    if (options.sortBy) {
      const sortFieldMap: Record<string, keyof VectorStoreRecord> = {
        created_at: 'createdAt',
        updated_at: 'updatedAt',
        access_count: 'accessCount',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        accessCount: 'accessCount',
        category: 'category',
        scope: 'scope',
        id: 'id',
      };
      const field = (sortFieldMap[options.sortBy] ?? options.sortBy) as keyof VectorStoreRecord;
      const dir = options.order === 'asc' ? 1 : -1;
      records.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return dir;
        if (bVal == null) return -dir;
        if (typeof aVal === 'string' && typeof bVal === 'string') return aVal.localeCompare(bVal) * dir;
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
        return String(aVal).localeCompare(String(bVal)) * dir;
      });
    } else {
      records.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
    }

    records = records.slice(offset, offset + limit);
    return { records, total };
  }

  async search(
    queryVector: number[],
    filters: VectorStoreFilter = {},
    limit = 30
  ): Promise<VectorStoreSearchMatch[]> {
    if (limit <= 0) return [];
    const where = this.buildQueryWhereClause(filters);
    const queryLimit = filters.scope ? Math.max(limit * 5, limit) : limit;

    const result = await this.collection.query({
      queryEmbeddings: [queryVector],
      nResults: queryLimit,
      ...(where ? { where } : {}),
      include: ['documents', 'metadatas', 'distances'],
    });

    if (!result.ids?.[0]) return [];

    const matches: VectorStoreSearchMatch[] = [];
    for (let i = 0; i < result.ids[0].length; i++) {
      const metadata = result.metadatas?.[0]?.[i] ?? {};
      const distance = result.distances?.[0]?.[i] ?? 0;
      const score = this.distanceToScore(distance);

      matches.push(this.toSearchMatch(
        result.ids[0][i],
        result.documents?.[0]?.[i] ?? '',
        metadata,
        score,
        {
          _vector_similarity: score,
          _quality_score: score,
        },
      ));
    }

    return this.applyScopeFilter(matches, filters).slice(0, limit);
  }

  async hybridSearch(
    queryVector: number[],
    queryText: string,
    filters: VectorStoreFilter = {},
    limit = 30,
  ): Promise<VectorStoreSearchMatch[]> {
    if (limit <= 0) return [];

    const candidateLimit = Math.max(limit * 3, limit);
    const vectorResults = await this.search(queryVector, filters, candidateLimit);
    if (!queryText.trim()) {
      return vectorResults.slice(0, limit);
    }

    try {
      const textResults = await this.nativeFullTextSearch(queryText, filters, candidateLimit);
      if (textResults.length === 0) {
        return vectorResults.slice(0, limit);
      }
      return this.fuseHybridResults(vectorResults, textResults, limit);
    } catch {
      return vectorResults.slice(0, limit);
    }
  }

  async count(filters: VectorStoreFilter = {}): Promise<number> {
    if (filters.scope) {
      const { records } = await this.list(filters, Number.MAX_SAFE_INTEGER, 0);
      return records.length;
    }
    const { clause, params } = this.buildSqlWhere(filters);
    const result = await this.client.execute(
      `SELECT COUNT(*) AS count FROM \`${this.tableName}\`${clause}`,
      params,
    ) as Array<{ count: number | string }>;
    return Number(result[0]?.count ?? 0);
  }

  async incrementAccessCount(id: string): Promise<void> {
    const record = await this.getById(id);
    if (!record) return;
    const metadata = {
      ...(record.metadata ?? {}),
      access_count: (record.accessCount ?? 0) + 1,
    };
    await this.client.execute(
      `UPDATE \`${this.tableName}\` SET metadata = ? WHERE _id = ?`,
      [
        this.serializePayloadMetadata({
          data: record.content,
          user_id: record.userId ?? null,
          agent_id: record.agentId ?? null,
          run_id: record.runId ?? null,
          actor_id: record.actorId ?? null,
          hash: record.hash ?? '',
          created_at: record.createdAt,
          updated_at: record.updatedAt,
          category: record.category ?? null,
          fulltext_content: record.content,
          metadata,
        }),
        id,
      ],
    );
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.incrementAccessCount(id);
    }
  }

  async removeAll(filters: VectorStoreFilter = {}): Promise<void> {
    if (!filters.scope) {
      const { clause, params } = this.buildSqlWhere(filters);
      await this.client.execute(
        `DELETE FROM \`${this.tableName}\`${clause}`,
        params,
      );
      return;
    }

    const { records } = await this.list(filters, Number.MAX_SAFE_INTEGER, 0);
    for (const record of records) {
      await this.remove(record.id);
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    await SeekDBStore.releaseClient(this.clientKey);
    this.collection = null;
    this.client = null;
  }
}
