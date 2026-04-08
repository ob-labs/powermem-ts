/**
 * Storage factory — create VectorStore instances by provider name.
 * Port of Python powermem/storage/factory.py.
 */
import type { GraphStoreBase, VectorStore } from './base.js';
import type { SparseEmbedder } from '../integrations/embeddings/sparse.js';

type StoreCreator = (config: Record<string, unknown>) => Promise<VectorStore>;
type GraphStoreCreator = (config: Record<string, unknown>) => Promise<GraphStoreBase>;

const registry = new Map<string, StoreCreator>();
const graphRegistry = new Map<string, GraphStoreCreator>();

export class VectorStoreFactory {
  /** Register a new vector store provider. */
  static register(name: string, creator: StoreCreator): void {
    registry.set(name.toLowerCase(), creator);
  }

  /** Create a VectorStore by provider name + config dict. */
  static async create(provider: string, config: Record<string, unknown> = {}): Promise<VectorStore> {
    const name = provider.toLowerCase();
    const creator = registry.get(name);
    if (!creator) {
      throw new Error(
        `Unsupported VectorStore provider: "${provider}". ` +
        `Supported: ${VectorStoreFactory.getSupportedProviders().join(', ')}`
      );
    }
    return creator(config);
  }

  /** Get list of registered provider names. */
  static getSupportedProviders(): string[] {
    return Array.from(registry.keys());
  }

  /** Check if a provider is registered. */
  static hasProvider(provider: string): boolean {
    return registry.has(provider.toLowerCase());
  }
}

export class GraphStoreFactory {
  static register(name: string, creator: GraphStoreCreator): void {
    graphRegistry.set(name.toLowerCase(), creator);
  }

  static async create(provider: string, config: Record<string, unknown> = {}): Promise<GraphStoreBase> {
    const name = provider.toLowerCase();
    const creator = graphRegistry.get(name);
    if (!creator) {
      throw new Error(
        `Unsupported GraphStore provider: "${provider}". ` +
        `Supported: ${GraphStoreFactory.getSupportedProviders().join(', ')}`
      );
    }
    return creator(config);
  }

  static getSupportedProviders(): string[] {
    return Array.from(graphRegistry.keys());
  }
}

// ─── Register built-in providers ──────────────────────────────────────────

VectorStoreFactory.register('sqlite', async (config) => {
  const { SQLiteStore } = await import('./sqlite/sqlite.js');
  const dbPath = (config.path as string) ?? './data/powermem_dev.db';
  return new SQLiteStore(dbPath);
});

VectorStoreFactory.register('seekdb', async (config) => {
  const { SeekDBStore } = await import('./seekdb/seekdb.js');
  return SeekDBStore.create({
    path: (config.path as string) ?? './seekdb_data',
    database: (config.database as string | undefined) ?? 'test',
    collectionName: (config.collectionName as string | undefined) ?? 'power_mem',
    distance: (config.distance as 'cosine' | 'l2' | 'inner_product' | undefined) ?? 'l2',
    dimension: (config.dimension as number | undefined) ?? (config.embeddingModelDims as number | undefined),
    includeSparse: (config.includeSparse as boolean | undefined) ?? false,
    sparseEmbedder: config.sparseEmbedder as SparseEmbedder | undefined,
  });
});

VectorStoreFactory.register('pgvector', async (config) => {
  const { PgVectorStore } = await import('./pgvector/pgvector.js');
  return PgVectorStore.create({
    connectionString: config.connectionString as string | undefined,
    tableName: (config.tableName as string | undefined) ?? (config.collectionName as string | undefined),
    dimensions: (config.dimensions as number | undefined) ?? (config.embeddingModelDims as number | undefined),
    dbname: config.dbname as string | undefined,
    host: config.host as string | undefined,
    port: typeof config.port === 'number' ? config.port as number : undefined,
    user: config.user as string | undefined,
    password: config.password as string | undefined,
    sslmode: config.sslmode as string | undefined,
  });
});

// Aliases
VectorStoreFactory.register('postgres', async (config) => {
  return VectorStoreFactory.create('pgvector', config);
});
VectorStoreFactory.register('pg', async (config) => {
  return VectorStoreFactory.create('pgvector', config);
});
VectorStoreFactory.register('oceanbase', async (config) => {
  const host = (config.host as string | undefined) ?? '';
  if (host) {
    throw new Error(
      'powermem-ts currently supports OceanBase vector storage only in embedded mode. ' +
      'Leave OCEANBASE_HOST empty to use OCEANBASE_PATH-backed storage.'
    );
  }

  return VectorStoreFactory.create('seekdb', {
    path: (config.obPath as string | undefined) ?? './seekdb_data',
    database: (config.dbName as string | undefined) ?? 'test',
    collectionName: (config.collectionName as string | undefined) ?? 'power_mem',
    distance: (config.vidxMetricType as 'cosine' | 'l2' | 'inner_product' | undefined) ?? 'l2',
    dimension: (config.embeddingModelDims as number | undefined) ?? (config.dimensions as number | undefined),
    includeSparse: (config.includeSparse as boolean | undefined) ?? false,
    sparseEmbedder: config.sparseEmbedder as SparseEmbedder | undefined,
  });
});

GraphStoreFactory.register('oceanbase', async (config) => {
  const { MemoryGraph } = await import('./oceanbase/oceanbase_graph.js');
  return new MemoryGraph(config);
});
