export { Memory } from './core/memory.js';
export { NativeProvider } from './core/native-provider.js';
export { SeekDBStore } from './storage/seekdb/seekdb.js';
export type { SeekDBStoreOptions } from './storage/seekdb/seekdb.js';

export type { MemoryProvider } from './core/provider.js';
export type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from './storage/base.js';

export type {
  MemoryRecord,
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
} from './types/memory.js';

export type {
  AddResult,
  SearchHit,
  SearchResult,
  MemoryListResult,
} from './types/responses.js';

export type { InitOptions, MemoryOptions, RerankerFn, SeekDBOptions } from './types/options.js';

export {
  PowerMemError,
  PowerMemInitError,
  PowerMemStartupError,
  PowerMemConnectionError,
  PowerMemAPIError,
} from './errors/index.js';
