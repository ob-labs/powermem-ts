import type { MemoryRecord } from './memory.js';

export interface AddResult {
  memories: MemoryRecord[];
  message: string;
}

export interface SearchHit {
  memoryId: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  results: SearchHit[];
  total: number;
  query: string;
  relations?: Array<Record<string, unknown>>;
}

export interface MemoryListResult {
  memories: MemoryRecord[];
  total: number;
  limit: number;
  offset: number;
}
