import type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from './vector-store.js';

export interface SeekDBStoreOptions {
  path: string;
  database?: string;
  collectionName?: string;
  distance?: 'cosine' | 'l2' | 'inner_product';
  dimension?: number;
}

export class SeekDBStore implements VectorStore {
   
  private client: any;
   
  private collection: any;

   
  private constructor(client: any, collection: any) {
    this.client = client;
    this.collection = collection;
  }

  static async create(options: SeekDBStoreOptions): Promise<SeekDBStore> {
    const { SeekdbClient, Schema, VectorIndexConfig } = await import('seekdb');

    const client = new SeekdbClient({
      path: options.path,
      database: options.database ?? 'powermem',
    });

    const dimension = options.dimension ?? 768;
    const distance = options.distance ?? 'cosine';

    const schema = new Schema({
      vectorIndex: new VectorIndexConfig({
        hnsw: { dimension, distance },
      }),
    });

    const collection = await client.getOrCreateCollection({
      name: options.collectionName ?? 'memories',
      schema,
    });

    return new SeekDBStore(client, collection);
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
      metadata_json: JSON.stringify(payload.metadata ?? {}),
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
      metadata: m.metadata_json ? JSON.parse(m.metadata_json) : undefined,
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

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
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

      matches.push({
        id: result.ids[0][i],
        content: result.documents?.[0]?.[i] ?? '',
        score: Math.max(0, 1 - distance),
        metadata: metadata.metadata_json ? JSON.parse(metadata.metadata_json) : undefined,
        createdAt: metadata.created_at || undefined,
        updatedAt: metadata.updated_at || undefined,
        accessCount: metadata.access_count ?? 0,
      });
    }

    return matches;
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
    await this.client?.close?.();
    this.collection = null;
    this.client = null;
  }
}
