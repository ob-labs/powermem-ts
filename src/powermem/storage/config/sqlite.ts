import type { BaseVectorStoreConfig } from './base.js';

export interface SQLiteConfig extends BaseVectorStoreConfig {
  path?: string;
}
