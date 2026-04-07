export const DEFAULT_OCEANBASE_CONNECTION = {
  host: '',
  port: '2881',
  user: 'root@test',
  password: '',
  dbName: 'test',
  obPath: './seekdb_data',
};

export const DEFAULT_OCEANBASE_VECTOR_METRIC_TYPE = 'l2';
export const DEFAULT_VIDX_NAME = 'vidx';
export const DEFAULT_INDEX_TYPE = 'HNSW';

export const DEFAULT_OCEANBASE_HNSW_BUILD_PARAM = { M: 16, efConstruction: 200 };
export const DEFAULT_OCEANBASE_HNSW_SEARCH_PARAM = { efSearch: 64 };
export const DEFAULT_OCEANBASE_IVF_BUILD_PARAM = { nlist: 128 };
export const DEFAULT_OCEANBASE_IVF_SEARCH_PARAM = {};
export const DEFAULT_OCEANBASE_IVF_PQ_BUILD_PARAM = { nlist: 128, m: 3 };
export const DEFAULT_OCEANBASE_FLAT_BUILD_PARAM = {};
export const DEFAULT_OCEANBASE_FLAT_SEARCH_PARAM = {};

export const TABLE_ENTITIES = 'graph_entities';
export const TABLE_RELATIONSHIPS = 'graph_relationships';
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
export const DEFAULT_PATH_STRING_LENGTH = 500;
export const DEFAULT_SEARCH_LIMIT = 100;
export const DEFAULT_BM25_TOP_N = 15;
export const DEFAULT_LLM_PROVIDER = 'openai';

export function getDefaultBuildParams(indexType: string): Record<string, unknown> {
  switch (indexType) {
    case 'HNSW':
    case 'HNSW_SQ':
      return { ...DEFAULT_OCEANBASE_HNSW_BUILD_PARAM };
    case 'IVF':
    case 'IVF_FLAT':
    case 'IVF_SQ':
      return { ...DEFAULT_OCEANBASE_IVF_BUILD_PARAM };
    case 'IVF_PQ':
      return { ...DEFAULT_OCEANBASE_IVF_PQ_BUILD_PARAM };
    default:
      return { ...DEFAULT_OCEANBASE_FLAT_BUILD_PARAM };
  }
}

export function getDefaultSearchParams(indexType: string): Record<string, unknown> {
  switch (indexType) {
    case 'HNSW':
    case 'HNSW_SQ':
      return { ...DEFAULT_OCEANBASE_HNSW_SEARCH_PARAM };
    case 'IVF':
    case 'IVF_FLAT':
    case 'IVF_SQ':
      return { ...DEFAULT_OCEANBASE_IVF_SEARCH_PARAM };
    default:
      return { ...DEFAULT_OCEANBASE_FLAT_SEARCH_PARAM };
  }
}
