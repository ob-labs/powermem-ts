export { Memory } from './memory.js';

export type { MemoryProvider } from './provider/index.js';

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

export type { InitOptions, MemoryOptions } from './types/options.js';

export {
  PowerMemError,
  PowerMemInitError,
  PowerMemStartupError,
  PowerMemConnectionError,
  PowerMemAPIError,
} from './errors/index.js';
