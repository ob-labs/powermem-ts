/**
 * Intelligence manager — orchestrator for memory intelligence features.
 * Port of Python powermem/intelligence/manager.py.
 */
import type { VectorStoreSearchMatch } from '../storage/base.js';
import { ImportanceEvaluator } from './importance-evaluator.js';
import {
  IntelligentMemoryManager,
  type IntelligenceConfig,
} from './intelligent-memory-manager.js';

export class IntelligenceManager {
  readonly importanceEvaluator: ImportanceEvaluator;
  readonly intelligentMemoryManager: IntelligentMemoryManager;

  constructor(config: IntelligenceConfig = {}) {
    this.importanceEvaluator = new ImportanceEvaluator();
    this.intelligentMemoryManager = new IntelligentMemoryManager(
      config,
      this.importanceEvaluator,
    );
  }

  processMetadata(
    content: string,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return this.intelligentMemoryManager.processMetadata(content, metadata);
  }

  processSearchResults(results: VectorStoreSearchMatch[]): VectorStoreSearchMatch[] {
    return this.intelligentMemoryManager.processSearchResults(results);
  }

  /**
   * Trigger a memory optimization pass. Parity with Python
   * `IntelligenceManager.optimize_memories`
   * (intelligence/manager.py:126). Stub: returns an empty result; the full
   * implementation requires a MemoryOptimizer wired into the manager.
   */
  optimizeMemories(): { compressed: number; deduplicated: number } {
    return { compressed: 0, deduplicated: 0 };
  }

  /**
   * Get aggregated memory statistics (count, type distribution, etc). Parity
   * with Python `IntelligenceManager.get_memory_stats`
   * (intelligence/manager.py:138). Stub: returns an empty stats object; the
   * full implementation queries the underlying store.
   */
  getMemoryStats(): Record<string, unknown> {
    return {
      totalMemories: 0,
      byType: {},
      avgImportance: 0,
      topAccessed: [],
      growthTrend: {},
      ageDistribution: {
        '< 1 day': 0,
        '1-7 days': 0,
        '7-30 days': 0,
        '> 30 days': 0,
      },
    };
  }
}

export type { IntelligenceConfig };
