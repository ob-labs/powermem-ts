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
}

export type { IntelligenceConfig };
