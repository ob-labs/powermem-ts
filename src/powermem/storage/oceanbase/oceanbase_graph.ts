import type { GraphStoreBase } from '../base.js';
import type { OceanBaseGraphConfig } from '../config/oceanbase.js';
import { SnowflakeIDGenerator } from '../../utils/snowflake.js';
import {
  DEFAULT_INDEX_TYPE,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OCEANBASE_CONNECTION,
  DEFAULT_OCEANBASE_VECTOR_METRIC_TYPE,
  DEFAULT_VIDX_NAME,
  TABLE_ENTITIES,
  TABLE_RELATIONSHIPS,
  getDefaultBuildParams,
  getDefaultSearchParams,
} from './constants.js';

interface GraphEntry {
  id: string;
  data: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchesFilters(entry: GraphEntry, filters: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (entry.filters[key] !== value) return false;
  }
  return true;
}

export class MemoryGraph implements GraphStoreBase {
  private readonly idGen = new SnowflakeIDGenerator();
  private readonly entries: GraphEntry[] = [];
  private readonly config: Required<Pick<
    OceanBaseGraphConfig,
    'host' | 'port' | 'user' | 'password' | 'dbName' | 'obPath' | 'collectionName' |
    'indexType' | 'vidxMetricType' | 'vidxName' | 'maxHops'
  >> & {
    embeddingModelDims?: number | null;
    vidxAlgoParams: Record<string, unknown>;
    llm: { provider?: string; config?: Record<string, unknown> };
  };

  constructor(config: Partial<OceanBaseGraphConfig> = {}) {
    const indexType = config.indexType ?? DEFAULT_INDEX_TYPE;
    this.config = {
      host: config.host ?? DEFAULT_OCEANBASE_CONNECTION.host,
      port: config.port ?? DEFAULT_OCEANBASE_CONNECTION.port,
      user: config.user ?? DEFAULT_OCEANBASE_CONNECTION.user,
      password: config.password ?? DEFAULT_OCEANBASE_CONNECTION.password,
      dbName: config.dbName ?? DEFAULT_OCEANBASE_CONNECTION.dbName,
      obPath: config.obPath ?? DEFAULT_OCEANBASE_CONNECTION.obPath,
      collectionName: config.collectionName ?? 'power_mem',
      embeddingModelDims: config.embeddingModelDims ?? null,
      indexType,
      vidxMetricType: config.vidxMetricType ?? DEFAULT_OCEANBASE_VECTOR_METRIC_TYPE,
      vidxName: config.vidxName ?? DEFAULT_VIDX_NAME,
      maxHops: config.maxHops ?? 3,
      vidxAlgoParams: config.vidxAlgoParams ?? getDefaultBuildParams(indexType),
      llm: config.llm ?? { provider: DEFAULT_LLM_PROVIDER },
    };
  }

  async add(data: string, filters: Record<string, unknown>): Promise<Record<string, unknown>> {
    const entry: GraphEntry = {
      id: this.idGen.nextId(),
      data,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return {
      id: entry.id,
      data: entry.data,
      createdAt: entry.createdAt,
      ...entry.filters,
      provider: 'oceanbase',
      collectionName: this.config.collectionName,
    };
  }

  async search(query: string, filters: Record<string, unknown>, limit = 10): Promise<Array<Record<string, unknown>>> {
    const queryTokens = tokenize(query);
    const results = this.entries
      .filter((entry) => matchesFilters(entry, filters))
      .map((entry) => {
        const contentTokens = tokenize(entry.data);
        const overlap = queryTokens.filter((token) => contentTokens.includes(token)).length;
        const includes = entry.data.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        return { entry, score: overlap + includes };
      })
      .filter((item) => item.score > 0 || queryTokens.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results.map(({ entry, score }) => ({
      id: entry.id,
      data: entry.data,
      score,
      createdAt: entry.createdAt,
      ...entry.filters,
      provider: 'oceanbase',
      maxHops: this.config.maxHops,
    }));
  }

  async deleteAll(filters: Record<string, unknown>): Promise<void> {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (matchesFilters(this.entries[index], filters)) {
        this.entries.splice(index, 1);
      }
    }
  }

  async getAll(filters: Record<string, unknown>, limit = 100): Promise<Array<Record<string, unknown>>> {
    return this.entries
      .filter((entry) => matchesFilters(entry, filters))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        data: entry.data,
        createdAt: entry.createdAt,
        ...entry.filters,
        provider: 'oceanbase',
      }));
  }

  async reset(): Promise<void> {
    this.entries.splice(0, this.entries.length);
  }

  async getStatistics(filters: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const filtered = this.entries.filter((entry) => matchesFilters(entry, filters));
    return {
      totalEntries: filtered.length,
      uniqueUsers: new Set(filtered.map((entry) => entry.filters.userId).filter(Boolean)).size,
      uniqueAgents: new Set(filtered.map((entry) => entry.filters.agentId).filter(Boolean)).size,
      provider: 'oceanbase',
      collectionName: this.config.collectionName,
      indexType: this.config.indexType,
      vidxMetricType: this.config.vidxMetricType,
      vidxName: this.config.vidxName,
      buildParams: this.config.vidxAlgoParams,
      searchParams: getDefaultSearchParams(this.config.indexType),
      tableEntities: TABLE_ENTITIES,
      tableRelationships: TABLE_RELATIONSHIPS,
    };
  }

  async getUniqueUsers(): Promise<string[]> {
    return Array.from(new Set(
      this.entries
        .map((entry) => entry.filters.userId)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    ));
  }
}
