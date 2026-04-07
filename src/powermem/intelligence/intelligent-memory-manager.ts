/**
 * Intelligent memory manager — metadata enrichment and decay-aware ranking.
 * Port of Python powermem/intelligence/intelligent_memory_manager.py.
 */
import type { VectorStoreSearchMatch } from '../storage/base.js';
import { ImportanceEvaluator } from './importance-evaluator.js';
import { computeDecayFactor, applyDecay } from './ebbinghaus-algorithm.js';

export interface IntelligenceConfig {
  enabled?: boolean;
  enableDecay?: boolean;
  decayWeight?: number;
}

export class IntelligentMemoryManager {
  private readonly enabled: boolean;
  private readonly enableDecay: boolean;
  private readonly decayWeight: number;
  readonly importanceEvaluator: ImportanceEvaluator;

  constructor(
    config: IntelligenceConfig = {},
    importanceEvaluator = new ImportanceEvaluator(),
  ) {
    this.enabled = config.enabled ?? false;
    this.enableDecay = config.enableDecay ?? false;
    this.decayWeight = config.decayWeight ?? 0.3;
    this.importanceEvaluator = importanceEvaluator;
  }

  processMetadata(
    content: string,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.enabled) return metadata ?? {};
    if (metadata?.importance !== undefined) return metadata;
    const importance = this.importanceEvaluator.evaluateImportance(content, metadata);
    return { ...(metadata ?? {}), importance };
  }

  processSearchResults(results: VectorStoreSearchMatch[]): VectorStoreSearchMatch[] {
    if (!this.enabled || !this.enableDecay) return results;

    for (const match of results) {
      const decay = computeDecayFactor({
        createdAt: match.createdAt ?? new Date().toISOString(),
        updatedAt: match.updatedAt ?? match.createdAt ?? new Date().toISOString(),
        accessCount: match.accessCount ?? 0,
      });
      match.score = applyDecay(match.score, decay, this.decayWeight);
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
