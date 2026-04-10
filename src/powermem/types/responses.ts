import type { MemoryRecord } from './memory.js';

export interface AddResult {
  memories: MemoryRecord[];
  message: string;
}

export interface SearchHit {
  memoryId: string;
  content: string;
  score?: number;
  userId?: string;
  agentId?: string;
  runId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
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
