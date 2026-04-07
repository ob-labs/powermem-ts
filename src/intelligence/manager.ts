/**
 * Intelligence manager — orchestrator for memory intelligence features.
 * Port of Python powermem/intelligence/manager.py.
 */
import type { VectorStoreSearchMatch } from '../storage/base.js';
import { computeDecayFactor, applyDecay } from './ebbinghaus.js';
import { ImportanceEvaluator } from './importance-evaluator.js';

export interface IntelligenceConfig {
  enabled?: boolean;
  enableDecay?: boolean;
  decayWeight?: number;
}

export class IntelligenceManager {
  private readonly enabled: boolean;
  private readonly enableDecay: boolean;
  private readonly decayWeight: number;
  readonly importanceEvaluator: ImportanceEvaluator;

  constructor(config: IntelligenceConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.enableDecay = config.enableDecay ?? false;
    this.decayWeight = config.decayWeight ?? 0.3;
    this.importanceEvaluator = new ImportanceEvaluator();
  }

  /** Enhance metadata with importance score. Preserves user-provided importance. */
  processMetadata(
    content: string,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!this.enabled) return metadata ?? {};
    // Don't overwrite user-provided importance
    if (metadata?.importance !== undefined) return metadata;
    const importance = this.importanceEvaluator.evaluateImportance(content, metadata);
    return { ...(metadata ?? {}), importance };
  }

  /** Apply Ebbinghaus decay and re-rank search results. */
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
