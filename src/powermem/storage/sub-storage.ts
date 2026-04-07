/**
 * Sub-storage system — multi-store routing + migration.
 * Port of Python SubStorageAdapter + SubStoreMigrationManager.
 *
 * Provides:
 * - Filter-based routing to different VectorStore instances
 * - Data migration between stores with re-embedding and progress tracking
 * - Migration state machine (pending → migrating → completed / failed)
 */
import type { VectorStore, VectorStoreFilter } from './base.js';
import type { Embedder } from '../integrations/embeddings/embedder.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MigrationStatus = 'pending' | 'migrating' | 'completed' | 'failed';

export interface SubStoreConfig {
  /** Unique name for this sub-store. */
  name: string;
  /** The VectorStore instance. */
  store: VectorStore;
  /**
   * Dict-based routing filter — a record is routed here if its metadata
   * matches ALL key-value pairs in this filter. If omitted, acts as a
   * function-based filter via the `match` field.
   */
  routingFilter?: Record<string, unknown>;
  /** Function-based filter — returns true if this store should handle the request. */
  match?: (params: { userId?: string; agentId?: string; scope?: string; metadata?: Record<string, unknown> }) => boolean;
  /** Optional embedder for this sub-store (used during migration to re-embed). */
  embedder?: Embedder;
}

export interface MigrationState {
  storeName: string;
  status: MigrationStatus;
  migratedCount: number;
  totalCount: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface MigrationResult {
  migratedCount: number;
  errors: number;
  status: MigrationStatus;
}

// ─── SubStoreMigrationManager ────────────────────────────────────────────────

export class SubStoreMigrationManager {
  private readonly states = new Map<string, MigrationState>();

  register(storeName: string): void {
    if (!this.states.has(storeName)) {
      this.states.set(storeName, {
        storeName,
        status: 'pending',
        migratedCount: 0,
        totalCount: 0,
      });
    }
  }

  markMigrating(storeName: string, totalCount: number): void {
    const state = this.states.get(storeName);
    if (!state) return;
    state.status = 'migrating';
    state.totalCount = totalCount;
    state.startedAt = new Date().toISOString();
  }

  updateProgress(storeName: string, count: number): void {
    const state = this.states.get(storeName);
    if (!state) return;
    state.migratedCount = count;
  }

  markCompleted(storeName: string): void {
    const state = this.states.get(storeName);
    if (!state) return;
    state.status = 'completed';
    state.completedAt = new Date().toISOString();
  }

  markFailed(storeName: string, error: string): void {
    const state = this.states.get(storeName);
    if (!state) return;
    state.status = 'failed';
    state.errorMessage = error;
    state.completedAt = new Date().toISOString();
  }

  isReady(storeName: string): boolean {
    const state = this.states.get(storeName);
    return state?.status === 'completed' || state?.status === 'pending';
  }

  getStatus(storeName: string): MigrationState | undefined {
    return this.states.get(storeName);
  }

  getAllStatuses(): MigrationState[] {
    return Array.from(this.states.values());
  }
}

// ─── SubStorageRouter ────────────────────────────────────────────────────────

export class SubStorageRouter {
  private readonly subStores = new Map<string, SubStoreConfig>();
  private mainStore: VectorStore;
  private mainEmbedder?: Embedder;
  readonly migrationManager = new SubStoreMigrationManager();

  constructor(mainStore: VectorStore, mainEmbedder?: Embedder) {
    this.mainStore = mainStore;
    this.mainEmbedder = mainEmbedder;
  }

  // ─── Registration ────────────────────────────────────────────────

  /** Register a sub-store with optional routing filter and embedder. */
  registerSubStore(config: SubStoreConfig): void {
    this.subStores.set(config.name, config);
    this.migrationManager.register(config.name);
  }

  /** Alias for backward compat. */
  addStore(config: SubStoreConfig): void {
    this.registerSubStore(config);
  }

  // ─── Routing ─────────────────────────────────────────────────────

  /**
   * Route a request to the appropriate store.
   * Checks each sub-store's routing filter or match function.
   * Falls back to main store if no sub-store matches.
   */
  routeToStore(params: {
    userId?: string;
    agentId?: string;
    scope?: string;
    metadata?: Record<string, unknown>;
  } = {}): VectorStore {
    for (const [name, config] of this.subStores) {
      // Only route to ready sub-stores
      if (!this.migrationManager.isReady(name)) continue;

      // Dict-based routing filter
      if (config.routingFilter) {
        const matches = Object.entries(config.routingFilter).every(([key, value]) => {
          if (params.metadata && key in params.metadata) return params.metadata[key] === value;
          if (key === 'userId') return params.userId === value;
          if (key === 'agentId') return params.agentId === value;
          if (key === 'scope') return params.scope === value;
          return false;
        });
        if (matches) return config.store;
      }

      // Function-based filter
      if (config.match && config.match(params)) {
        return config.store;
      }
    }

    return this.mainStore;
  }

  /** Shorthand for routeToStore. */
  getStore(params: { userId?: string; agentId?: string; scope?: string; metadata?: Record<string, unknown> } = {}): VectorStore {
    return this.routeToStore(params);
  }

  // ─── Migration ───────────────────────────────────────────────────

  /**
   * Migrate matching records from main store to a sub-store.
   * Optionally re-embeds content using the sub-store's embedder.
   */
  async migrateToSubStore(
    storeName: string,
    options: {
      deleteSource?: boolean;
      batchSize?: number;
      filter?: VectorStoreFilter;
    } = {},
  ): Promise<MigrationResult> {
    const config = this.subStores.get(storeName);
    if (!config) throw new Error(`Sub-store "${storeName}" not registered`);

    const batchSize = options.batchSize ?? 100;
    const targetStore = config.store;
    const targetEmbedder = config.embedder ?? this.mainEmbedder;

    // Count matching records
    const { records: allRecords } = await this.mainStore.list(options.filter, 100000);

    // Filter records that match this sub-store's routing
    const matchingRecords = allRecords.filter((rec) => {
      if (config.routingFilter) {
        return Object.entries(config.routingFilter).every(([key, value]) => {
          if (rec.metadata && key in rec.metadata) return rec.metadata[key] === value;
          if (key === 'userId') return rec.userId === value;
          if (key === 'agentId') return rec.agentId === value;
          if (key === 'scope') return rec.scope === value;
          return false;
        });
      }
      if (config.match) {
        return config.match({
          userId: rec.userId,
          agentId: rec.agentId,
          scope: rec.scope,
          metadata: rec.metadata,
        });
      }
      return false;
    });

    this.migrationManager.markMigrating(storeName, matchingRecords.length);

    let migrated = 0;
    let errors = 0;

    for (let i = 0; i < matchingRecords.length; i += batchSize) {
      const batch = matchingRecords.slice(i, i + batchSize);

      for (const rec of batch) {
        try {
          // Re-embed if target has its own embedder
          let embedding = rec.embedding ?? [];
          if (targetEmbedder) {
            embedding = await targetEmbedder.embed(rec.content);
          }

          // Build payload matching the original
          const payload: Record<string, unknown> = {
            data: rec.content,
            user_id: rec.userId ?? null,
            agent_id: rec.agentId ?? null,
            run_id: rec.runId ?? null,
            hash: rec.hash ?? '',
            created_at: rec.createdAt,
            updated_at: rec.updatedAt,
            scope: rec.scope ?? null,
            category: rec.category ?? null,
            access_count: rec.accessCount ?? 0,
            metadata: rec.metadata ?? {},
          };

          await targetStore.insert(rec.id, embedding, payload);

          if (options.deleteSource) {
            await this.mainStore.remove(rec.id);
          }

          migrated++;
        } catch {
          errors++;
        }
      }

      this.migrationManager.updateProgress(storeName, migrated);
    }

    if (errors === 0) {
      this.migrationManager.markCompleted(storeName);
    } else if (migrated === 0) {
      this.migrationManager.markFailed(storeName, `All ${errors} records failed to migrate`);
    } else {
      this.migrationManager.markCompleted(storeName);
    }

    return {
      migratedCount: migrated,
      errors,
      status: this.migrationManager.getStatus(storeName)!.status,
    };
  }

  // ─── Query helpers ───────────────────────────────────────────────

  /** Get migration status for a sub-store. */
  getMigrationStatus(storeName: string): MigrationState | undefined {
    return this.migrationManager.getStatus(storeName);
  }

  /** List all registered sub-store names. */
  listSubStores(): string[] {
    return Array.from(this.subStores.keys());
  }

  /** Check if a sub-store is ready (completed or pending migration). */
  isSubStoreReady(storeName: string): boolean {
    return this.migrationManager.isReady(storeName);
  }

  /** Get all registered stores (main + sub). */
  getAllStores(): VectorStore[] {
    return [this.mainStore, ...Array.from(this.subStores.values()).map(s => s.store)];
  }

  /** Get store by name. */
  getStoreByName(name: string): VectorStore | undefined {
    return this.subStores.get(name)?.store;
  }

  /** Number of registered sub-stores. */
  get size(): number {
    return this.subStores.size;
  }

  /** The main (default) store. */
  get defaultStore(): VectorStore {
    return this.mainStore;
  }
}
