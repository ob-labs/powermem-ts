/**
 * Memory optimizer — deduplication and compression.
 * Port of Python powermem/intelligence/memory_optimizer.py.
 */
import crypto from 'node:crypto';
import type { VectorStore, VectorStoreRecord } from '../storage/base.js';
import { cosineSimilarity } from '../utils/search.js';

export interface DeduplicateResult {
  totalChecked: number;
  duplicatesFound: number;
  deletedCount: number;
  errors: number;
}

export interface CompressResult {
  totalProcessed: number;
  clustersFound: number;
  compressedCount: number;
  newMemoriesCreated: number;
  errors: number;
}

type LLMGenerateFn = (messages: Array<{ role: string; content: string }>) => Promise<string>;

export class MemoryOptimizer {
  constructor(
    private readonly store: VectorStore,
    private readonly llmGenerate?: LLMGenerateFn
  ) {}

  /**
   * Deduplicate memories.
   * @param strategy - "exact" (MD5 hash) or "semantic" (cosine similarity)
   * @param userId - Optional user filter
   * @param threshold - Similarity threshold for semantic dedup (0-1)
   */
  async deduplicate(
    strategy: 'exact' | 'semantic' = 'exact',
    userId?: string,
    threshold = 0.95
  ): Promise<DeduplicateResult> {
    if (strategy === 'exact') return this.deduplicateExact(userId);
    return this.deduplicateSemantic(userId, threshold);
  }

  /** Exact dedup: group by MD5 hash, keep oldest, delete rest. */
  private async deduplicateExact(userId?: string): Promise<DeduplicateResult> {
    const stats: DeduplicateResult = { totalChecked: 0, duplicatesFound: 0, deletedCount: 0, errors: 0 };

    const { records } = await this.store.list(userId ? { userId } : {}, 10000);
    stats.totalChecked = records.length;

    // Group by hash
    const groups = new Map<string, VectorStoreRecord[]>();
    for (const rec of records) {
      let hash = rec.hash;
      if (!hash && rec.content) {
        hash = crypto.createHash('md5').update(rec.content, 'utf-8').digest('hex');
      }
      if (hash) {
        const group = groups.get(hash) ?? [];
        group.push(rec);
        groups.set(hash, group);
      }
    }

    // Delete duplicates (keep oldest per group)
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id));
      const duplicates = group.slice(1);
      stats.duplicatesFound += duplicates.length;

      for (const dup of duplicates) {
        const ok = await this.store.remove(dup.id);
        if (ok) stats.deletedCount++;
        else stats.errors++;
      }
    }

    return stats;
  }

  /** Semantic dedup: compare embeddings, delete similar (above threshold). */
  private async deduplicateSemantic(userId?: string, threshold = 0.95): Promise<DeduplicateResult> {
    const stats: DeduplicateResult = { totalChecked: 0, duplicatesFound: 0, deletedCount: 0, errors: 0 };

    const { records } = await this.store.list(userId ? { userId } : {}, 10000);
    stats.totalChecked = records.length;

    const withEmbeddings = records.filter((r) => r.embedding && r.embedding.length > 0);
    withEmbeddings.sort((a, b) => (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id));

    const unique: VectorStoreRecord[] = [];
    const duplicates: VectorStoreRecord[] = [];

    for (const mem of withEmbeddings) {
      let isDuplicate = false;
      for (const u of unique) {
        const sim = cosineSimilarity(mem.embedding!, u.embedding!);
        if (sim >= threshold) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) duplicates.push(mem);
      else unique.push(mem);
    }

    stats.duplicatesFound = duplicates.length;
    for (const dup of duplicates) {
      const ok = await this.store.remove(dup.id);
      if (ok) stats.deletedCount++;
      else stats.errors++;
    }

    return stats;
  }

  /**
   * Compress memories by clustering similar ones and summarizing via LLM.
   * Requires an LLM function to be provided.
   */
  async compress(userId?: string, threshold = 0.85): Promise<CompressResult> {
    const stats: CompressResult = {
      totalProcessed: 0, clustersFound: 0,
      compressedCount: 0, newMemoriesCreated: 0, errors: 0,
    };

    if (!this.llmGenerate) {
      return stats;
    }

    const { records } = await this.store.list(userId ? { userId } : {}, 1000);
    const valid = records.filter((r) => r.embedding && r.embedding.length > 0);
    stats.totalProcessed = valid.length;
    if (valid.length === 0) return stats;

    valid.sort((a, b) => a.id.localeCompare(b.id));

    // Greedy clustering
    const processed = new Set<string>();
    const clusters: VectorStoreRecord[][] = [];

    for (let i = 0; i < valid.length; i++) {
      const mem = valid[i];
      if (processed.has(mem.id)) continue;

      const cluster = [mem];
      processed.add(mem.id);

      for (let j = i + 1; j < valid.length; j++) {
        const candidate = valid[j];
        if (processed.has(candidate.id)) continue;

        const sim = cosineSimilarity(mem.embedding!, candidate.embedding!);
        if (sim >= threshold) {
          cluster.push(candidate);
          processed.add(candidate.id);
        }
      }

      if (cluster.length > 1) clusters.push(cluster);
    }

    stats.clustersFound = clusters.length;

    // LLM summarize each cluster
    for (const cluster of clusters) {
      try {
        const memoriesText = cluster.map((m) => `- ${m.content}`).join('\n');
        const prompt = `Summarize these related memories into one concise memory:\n${memoriesText}\n\nReturn only the summarized memory text.`;
        const summary = await this.llmGenerate([{ role: 'user', content: prompt }]);

        if (summary) {
          // Delete old memories
          for (const old of cluster) {
            await this.store.remove(old.id);
            stats.compressedCount++;
          }
          stats.newMemoriesCreated++;
          // Note: caller is responsible for adding the summary back via Memory.add()
        }
      } catch {
        stats.errors++;
      }
    }

    return stats;
  }
}
