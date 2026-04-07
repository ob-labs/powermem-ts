import { z } from 'zod/v4';
import type { BaseGraphStoreConfig } from './base.js';

export const OceanBaseGraphConfigSchema = z.object({
  host: z.string().default(''),
  port: z.string().default('2881'),
  user: z.string().default('root@test'),
  password: z.string().default(''),
  dbName: z.string().default('test'),
  obPath: z.string().default('./seekdb_data'),
  collectionName: z.string().default('power_mem'),
  embeddingModelDims: z.number().int().positive().nullish(),
  indexType: z.string().default('HNSW'),
  vidxMetricType: z.string().default('l2'),
  vidxName: z.string().default('vidx'),
  maxHops: z.number().int().positive().default(3),
  vidxAlgoParams: z.record(z.string(), z.unknown()).nullish(),
}).default(() => ({
  host: '',
  port: '2881',
  user: 'root@test',
  password: '',
  dbName: 'test',
  obPath: './seekdb_data',
  collectionName: 'power_mem',
  embeddingModelDims: undefined,
  indexType: 'HNSW',
  vidxMetricType: 'l2',
  vidxName: 'vidx',
  maxHops: 3,
  vidxAlgoParams: undefined,
}));

export type OceanBaseGraphConfig = BaseGraphStoreConfig & z.infer<typeof OceanBaseGraphConfigSchema>;

export const OCEANBASE_GRAPH_CLASS_PATH = 'powermem.storage.oceanbase.oceanbase_graph.MemoryGraph';
