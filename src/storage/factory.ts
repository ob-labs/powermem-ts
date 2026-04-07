/**
 * Storage factory — create VectorStore instances by provider name.
 * Port of Python powermem/storage/factory.py.
 */
import type { VectorStore } from './base.js';

type StoreCreator = (config: Record<string, unknown>) => Promise<VectorStore>;

const registry = new Map<string, StoreCreator>();

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

// ─── Register built-in providers ──────────────────────────────────────────

VectorStoreFactory.register('sqlite', async (config) => {
  const { SQLiteStore } = await import('./sqlite/sqlite.js');
  const dbPath = (config.path as string) ?? ':memory:';
  return new SQLiteStore(dbPath);
});

VectorStoreFactory.register('seekdb', async (config) => {
  const { SeekDBStore } = await import('./seekdb/seekdb.js');
  return SeekDBStore.create({
    path: (config.path as string) ?? './seekdb_data',
    database: config.database as string | undefined,
    collectionName: config.collectionName as string | undefined,
    distance: config.distance as 'cosine' | 'l2' | 'inner_product' | undefined,
    dimension: config.dimension as number | undefined,
  });
});

VectorStoreFactory.register('pgvector', async (config) => {
  const { PgVectorStore } = await import('./pgvector/pgvector.js');
  return PgVectorStore.create({
    connectionString: config.connectionString as string | undefined,
    tableName: config.tableName as string | undefined,
    dimensions: config.dimensions as number | undefined,
  });
});

// Aliases
VectorStoreFactory.register('postgres', async (config) => {
  return VectorStoreFactory.create('pgvector', config);
});
VectorStoreFactory.register('pg', async (config) => {
  return VectorStoreFactory.create('pgvector', config);
});
