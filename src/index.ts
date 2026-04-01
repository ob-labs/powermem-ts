export { Memory } from './memory.js';
export { NativeProvider } from './provider/native/index.js';

export type { MemoryProvider } from './provider/index.js';
export type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from './provider/native/vector-store.js';

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

export type { InitOptions, MemoryOptions, RerankerFn } from './types/options.js';

export {
  PowerMemError,
  PowerMemInitError,
  PowerMemStartupError,
  PowerMemConnectionError,
  PowerMemAPIError,
} from './errors/index.js';
