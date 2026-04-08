import type { BaseVectorStoreConfig } from './base.js';

export interface SeekDBConfig extends BaseVectorStoreConfig {
  path?: string;
  database?: string;
  distance?: 'cosine' | 'l2' | 'inner_product';
  dimension?: number;
  includeSparse?: boolean;
}
