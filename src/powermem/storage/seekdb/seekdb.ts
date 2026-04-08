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

  private readonly distanceMetric: 'cosine' | 'l2' | 'inner_product';

  private readonly clientKey: string;

  private isClosed = false;

  private constructor(
    client: any,
    collection: any,
    distanceMetric: 'cosine' | 'l2' | 'inner_product',
    clientKey: string,
  ) {
    this.client = client;
    this.collection = collection;
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
    const { SeekdbClient, Schema, VectorIndexConfig, FulltextIndexConfig } = await import('seekdb') as any;

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
      });

      const collection = await SeekDBStore.resolveCollection(client, {
        name: options.collectionName ?? 'power_mem',
        schema,
      });

      return new SeekDBStore(
        client,
        collection,
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

  // ─── Payload ↔ Metadata mapping ──────────────────────────────────────
  private toSeekDBMetadata(payload: Record<string, unknown>): Record<string, any> {
    return {
      user_id: (payload.user_id as string) ?? '',
      agent_id: (payload.agent_id as string) ?? '',
      run_id: (payload.run_id as string) ?? '',
      hash: (payload.hash as string) ?? '',
      created_at: (payload.created_at as string) ?? '',
      updated_at: (payload.updated_at as string) ?? '',
      scope: (payload.scope as string) ?? '',
      category: (payload.category as string) ?? '',
      access_count: (payload.access_count as number) ?? 0,
      // Base64-encode metadata to avoid SeekDB C engine JSON parsing issues
      metadata_b64: Buffer.from(JSON.stringify(payload.metadata ?? {})).toString('base64'),
    };
  }

  private decodeUserMetadata(metadata: Record<string, any> | null | undefined): Record<string, unknown> {
    if (!metadata) return {};
    try {
      if (metadata.metadata_b64) {
        return JSON.parse(Buffer.from(metadata.metadata_b64, 'base64').toString()) as Record<string, unknown>;
      }
      if (metadata.metadata_json) {
        return JSON.parse(metadata.metadata_json) as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }

  private withSystemScores(
    metadata: Record<string, any> | null | undefined,
    systemScores: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...this.decodeUserMetadata(metadata),
      ...systemScores,
    };
  }

  private toRecord(
    id: string,
    document: string | null,
    metadata: Record<string, any> | null,
    embedding?: number[] | null
  ): VectorStoreRecord {
    const m = metadata ?? {};
    return {
      id,
      content: document ?? '',
      userId: m.user_id || undefined,
      agentId: m.agent_id || undefined,
      runId: m.run_id || undefined,
      hash: m.hash || undefined,
      metadata: this.decodeUserMetadata(m),
      embedding: embedding ?? undefined,
      createdAt: m.created_at || new Date().toISOString(),
      updatedAt: m.updated_at || new Date().toISOString(),
      scope: m.scope || undefined,
      category: m.category || undefined,
      accessCount: m.access_count ?? 0,
    };
  }

  private buildWhereClause(filters: VectorStoreFilter): Record<string, any> | null {
    const conditions: Record<string, any>[] = [];
    if (filters.userId) conditions.push({ user_id: { $eq: filters.userId } });
    if (filters.agentId) conditions.push({ agent_id: { $eq: filters.agentId } });
    if (filters.runId) conditions.push({ run_id: { $eq: filters.runId } });
    if (filters.scope) conditions.push({ scope: { $eq: filters.scope } });
    if (filters.category) conditions.push({ category: { $eq: filters.category } });

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  private toSearchMatch(
    id: string,
    document: string | null,
    metadata: Record<string, any> | null,
    score: number,
    systemScores: Record<string, unknown> = {},
  ): VectorStoreSearchMatch {
    return {
      id,
      content: document ?? '',
      score,
      metadata: this.withSystemScores(metadata, systemScores),
      createdAt: metadata?.created_at || undefined,
      updatedAt: metadata?.updated_at || undefined,
      accessCount: metadata?.access_count ?? 0,
    };
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

    const where = this.buildWhereClause(filters);
    const result = await this.collection.hybridSearch({
      query: {
        whereDocument: { $contains: trimmedQuery },
        ...(where ? { where } : {}),
      },
      nResults: limit,
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
    return matches.slice(0, limit);
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
    const document = (payload.data as string) ?? '';
    await this.collection.add({
      ids: [id],
      documents: [document],
      embeddings: [vector],
      metadatas: [this.toSeekDBMetadata(payload)],
    });
  }

  async getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    const result = await this.collection.get({
      ids: [id],
      include: ['documents', 'metadatas', 'embeddings'],
    });
    if (!result.ids || result.ids.length === 0) return null;

    const record = this.toRecord(
      result.ids[0],
      result.documents?.[0] ?? null,
      result.metadatas?.[0] ?? null,
      result.embeddings?.[0] ?? null
    );

    if (userId && record.userId !== userId) return null;
    if (agentId && record.agentId !== agentId) return null;
    return record;
  }

  async update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    const document = (payload.data as string) ?? '';
    await this.collection.update({
      ids: [id],
      documents: [document],
      embeddings: [vector],
      metadatas: [this.toSeekDBMetadata(payload)],
    });
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.collection.get({ ids: [id] });
    if (!existing.ids || existing.ids.length === 0) return false;
    await this.collection.delete({ ids: [id] });
    return true;
  }

  async list(
    filters: VectorStoreFilter = {},
    limit = 100,
    offset = 0,
    options: VectorStoreListOptions = {}
  ): Promise<{ records: VectorStoreRecord[]; total: number }> {
    const where = this.buildWhereClause(filters);

    const allResults = await this.collection.get({
      ...(where ? { where } : {}),
      include: ['documents', 'metadatas', 'embeddings'],
    });

    const total = allResults.ids?.length ?? 0;

    let records: VectorStoreRecord[] = [];
    if (allResults.ids) {
      for (let i = 0; i < allResults.ids.length; i++) {
        records.push(this.toRecord(
          allResults.ids[i],
          allResults.documents?.[i] ?? null,
          allResults.metadatas?.[i] ?? null,
          allResults.embeddings?.[i] ?? null
        ));
      }
    }

    // Client-side sorting (seekdb get() has no ORDER BY)
    if (options.sortBy) {
      const field = options.sortBy as keyof VectorStoreRecord;
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
    const where = this.buildWhereClause(filters);

    const result = await this.collection.query({
      queryEmbeddings: [queryVector],
      nResults: limit,
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

    return matches;
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
    const where = this.buildWhereClause(filters);
    if (!where) {
      return this.collection.count();
    }
    const result = await this.collection.get({ where, include: [] });
    return result.ids?.length ?? 0;
  }

  async incrementAccessCount(id: string): Promise<void> {
    const result = await this.collection.get({ ids: [id], include: ['metadatas'] });
    if (!result.ids || result.ids.length === 0) return;
    const metadata = result.metadatas?.[0] ?? {};
    await this.collection.update({
      ids: [id],
      metadatas: [{ ...metadata, access_count: ((metadata.access_count as number) ?? 0) + 1 }],
    });
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const result = await this.collection.get({ ids, include: ['metadatas'] });
    if (!result.ids || result.ids.length === 0) return;

    const updatedMetadatas = (result.metadatas ?? []).map((m: any) => ({
      ...(m ?? {}),
      access_count: ((m?.access_count as number) ?? 0) + 1,
    }));
    await this.collection.update({ ids: result.ids, metadatas: updatedMetadatas });
  }

  async removeAll(filters: VectorStoreFilter = {}): Promise<void> {
    const where = this.buildWhereClause(filters);
    if (where) {
      await this.collection.delete({ where });
    } else {
      const result = await this.collection.get({ include: [] });
      if (result.ids && result.ids.length > 0) {
        await this.collection.delete({ ids: [...result.ids] });
      }
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
