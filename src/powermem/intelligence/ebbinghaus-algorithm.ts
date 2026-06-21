/**
 * Ebbinghaus forgetting curve — full algorithm port from Python
 * `intelligence/ebbinghaus_algorithm.py`.
 *
 * Round 5 (deep feature parity): replaces the round-4 stub class with a real
 * port of the 8 most-used Python methods:
 *
 *   - `process_memory_metadata` (py:56)   → processMemoryMetadata
 *   - `calculate_decay`         (py:129)  → calculateDecay
 *   - `calculate_relevance`     (py:174)  → calculateRelevance
 *   - `should_promote`          (py:210)  → shouldPromote
 *   - `should_forget`           (py:247)  → shouldForget
 *   - `should_archive`          (py:274)  → shouldArchive
 *   - `get_review_schedule`     (py:306)  → getReviewSchedule
 *   - `_resolve_decay_rate`     (py:372)  → resolveDecayRate (private helper exposed for tests)
 *
 * The Python forgetting-curve formula is:
 *
 *   R = e^(-hours_elapsed / (24 * decay_rate))
 *
 * where `decay_rate` is a per-memory strength parameter (larger = slower
 * decay). Per-memory-type multipliers scale the strength: working (1x),
 * short_term (7x), long_term (60x). Reinforcement increases strength by
 * `(1 + reinforcement_factor * log1p(access_count))`.
 *
 * Review intervals default to [1, 6, 24, 72, 168] hours and are shortened by
 * importance: `interval * (1 - importance * review_adjustment_factor)`,
 * clamped to `review_interval_min_hours`.
 */

export interface DecayParams {
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  now?: Date;
}

// Legacy function exports kept for back-compat with round-4 tests.
export function computeDecayFactor(params: DecayParams): number {
  const now = params.now ?? new Date();
  const lastAccessed = new Date(params.updatedAt || params.createdAt);
  const elapsedHours = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return 1.0;
  const stability = 1.0 + Math.log2(1 + (params.accessCount ?? 0));
  const baseHalfLife = 24;
  const effectiveHalfLife = baseHalfLife * stability;
  const decay = Math.exp((-elapsedHours * Math.LN2) / effectiveHalfLife);
  return Math.max(0, Math.min(1, decay));
}

export function applyDecay(cosineScore: number, decayFactor: number, decayWeight = 0.3): number {
  return cosineScore * (1 - decayWeight) + cosineScore * decayFactor * decayWeight;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type MemoryType = 'working' | 'short_term' | 'long_term';

export interface ClassifyParams {
  retention: number;
  workingThreshold?: number;
  shortTermThreshold?: number;
  longTermThreshold?: number;
}

export function classifyMemoryType(params: ClassifyParams): MemoryType {
  const work = params.workingThreshold ?? 0.3;
  const short = params.shortTermThreshold ?? 0.6;
  const long = params.longTermThreshold ?? 0.8;
  if (params.retention < work) return 'working';
  if (params.retention < short) return 'working';
  if (params.retention < long) return 'short_term';
  return 'long_term';
}

export interface EbbinghausConfig {
  initialRetention?: number;
  /** Base decay strength S in the formula R = e^(-t / (24*S)). Larger = slower decay. */
  decayRate?: number;
  reinforcementFactor?: number;
  decayRateMultipliers?: Record<string, number>;
  workingThreshold?: number;
  shortTermThreshold?: number;
  longTermThreshold?: number;
  reviewIntervals?: number[];
  reviewAdjustmentFactor?: number;
  reviewIntervalMinHours?: number;
}

export interface MemoryLike {
  content?: string;
  memory?: string;
  createdAt?: string;
  importanceScore?: number;
  accessCount?: number;
  memoryType?: string;
  decayRate?: number;
  reinforcementFactor?: number;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ProcessMetadataResult {
  intelligence: {
    importanceScore: number;
    memoryType: string;
    initialRetention: number;
    decayRate: number;
    currentRetention: number;
    nextReview: string;
    reviewSchedule: string[];
    lastReviewed: string;
    reviewCount: number;
    accessCount: number;
    reinforcementFactor: number;
  };
  memoryManagement: {
    shouldPromote: boolean;
    shouldForget: boolean;
    shouldArchive: boolean;
    isActive: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── EbbinghausAlgorithm class ─────────────────────────────────────────────

const DEFAULT_DECAY_RATE_MULTIPLIERS: Record<string, number> = {
  working: 1,
  short_term: 7,
  long_term: 60,
};

const HOURS_PER_DAY = 24;

function parseDate(value: string | Date | undefined | null, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.length > 0) {
    const normalized = value.endsWith('Z') ? value : value.replace('Z', '+00:00');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function firstPresent<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return undefined;
}

export class EbbinghausAlgorithm {
  readonly initialRetention: number;
  readonly decayRate: number;
  readonly decayRateMultipliers: Record<string, number>;
  readonly reinforcementFactor: number;
  readonly workingThreshold: number;
  readonly shortTermThreshold: number;
  readonly longTermThreshold: number;
  readonly reviewIntervals: number[];
  readonly reviewAdjustmentFactor: number;
  readonly reviewIntervalMinHours: number;

  constructor(config: EbbinghausConfig = {}) {
    this.initialRetention = config.initialRetention ?? 1.0;
    // Python default 1.5. Round-4 TS default was 0.1 (semantically divergent).
    // The class-level default now matches Python so callers using the
    // full algorithm get Python-compatible behavior. Schema-level default
    // in configs.ts remains 0.1 for backwards compat with existing tests.
    this.decayRate = config.decayRate ?? 1.5;
    this.decayRateMultipliers = this.loadDecayRateMultipliers(config.decayRateMultipliers);
    this.reinforcementFactor = config.reinforcementFactor ?? 0.3;
    this.workingThreshold = config.workingThreshold ?? 0.3;
    this.shortTermThreshold = config.shortTermThreshold ?? 0.6;
    this.longTermThreshold = config.longTermThreshold ?? 0.8;
    this.reviewIntervals = config.reviewIntervals ?? [1, 6, 24, 72, 168];
    this.reviewAdjustmentFactor = config.reviewAdjustmentFactor ?? 0.3;
    this.reviewIntervalMinHours = config.reviewIntervalMinHours ?? 0.5;
  }

  /**
   * Process memory metadata and produce intelligence + memory-management
   * fields. Parity with Python `process_memory_metadata` (py:56).
   */
  processMemoryMetadata(
    content: string,
    importanceScore: number,
    memoryType: string,
  ): ProcessMetadataResult {
    try {
      const now = new Date();
      const initialRetention = this.initialRetention * importanceScore;
      const decayRate = this.getDecayRateForType(memoryType);
      const reviewSchedule = this.buildReviewSchedule(importanceScore, now);
      const nextReview = reviewSchedule.length > 0
        ? reviewSchedule[0].toISOString()
        : new Date(now.getTime() + 60 * 60 * 1000).toISOString();

      return {
        intelligence: {
          importanceScore,
          memoryType,
          initialRetention,
          decayRate,
          currentRetention: initialRetention,
          nextReview,
          reviewSchedule: reviewSchedule.map((d) => d.toISOString()),
          lastReviewed: now.toISOString(),
          reviewCount: 0,
          accessCount: 0,
          reinforcementFactor: this.reinforcementFactor,
        },
        memoryManagement: {
          shouldPromote: false,
          shouldForget: false,
          shouldArchive: false,
          isActive: true,
        },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    } catch {
      return {
        intelligence: {
          importanceScore,
          memoryType,
          initialRetention: 0,
          decayRate: this.decayRate,
          currentRetention: 0,
          nextReview: new Date().toISOString(),
          reviewSchedule: [],
          lastReviewed: new Date().toISOString(),
          reviewCount: 0,
          accessCount: 0,
          reinforcementFactor: this.reinforcementFactor,
        },
        memoryManagement: {
          shouldPromote: false,
          shouldForget: false,
          shouldArchive: false,
          isActive: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * R = e^(-hours / (24 * decayRate)). Parity with Python `calculate_decay`
   * (py:129). `decayRate` parameter overrides per-instance default; invalid
   * values fall back to the instance default.
   */
  calculateDecay(
    createdAt: string | Date | null | undefined,
    decayRate?: number,
  ): number {
    try {
      const created = parseDate(
        createdAt as string | Date | undefined,
        new Date(),
      );
      const now = new Date();
      const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

      let rate = decayRate ?? this.decayRate;
      if (!(rate > 0)) rate = this.decayRate;
      const decayFactor = Math.exp(-hoursElapsed / (HOURS_PER_DAY * rate));
      return Math.max(decayFactor, 0);
    } catch {
      return 0.5;
    }
  }

  /**
   * Simple keyword-overlap relevance score. Parity with Python
   * `calculate_relevance` (py:174).
   */
  calculateRelevance(memory: MemoryLike, query: string): number {
    try {
      const content = String(
        memory.content ?? memory.memory ?? '',
      ).toLowerCase();
      const queryLower = (query ?? '').toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(Boolean);
      const contentWords = content.split(/\s+/);
      if (queryWords.length === 0) return 0;
      let matches = 0;
      for (const w of queryWords) {
        if (contentWords.includes(w)) matches += 1;
      }
      return Math.min(matches / queryWords.length, 1.0);
    } catch {
      return 0;
    }
  }

  /**
   * Parity with Python `should_promote` (py:210). Promotes when:
   *   - access_count >= 3, OR
   *   - accessed at least once AND older than 24h, OR
   *   - importance_score >= short_term_threshold
   */
  shouldPromote(memory: MemoryLike): boolean {
    try {
      const accessCount = Number(memory.accessCount ?? 0);
      if (accessCount >= 3) return true;
      const createdAt = memory.createdAt;
      if (createdAt && accessCount > 0) {
        const created = parseDate(createdAt, new Date());
        const elapsedMs = Date.now() - created.getTime();
        if (elapsedMs > 24 * 60 * 60 * 1000) return true;
      }
      const importance = Number(memory.importanceScore ?? 0.5);
      if (importance >= this.shortTermThreshold) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parity with Python `should_forget` (py:247). Forgets when decay factor
   * (computed with reinforcement + per-type rate) drops below
   * working_threshold.
   */
  shouldForget(memory: MemoryLike): boolean {
    try {
      const createdAt = memory.createdAt;
      if (!createdAt) return false;
      const rate = this.resolveDecayRate(memory);
      const decay = this.calculateDecay(createdAt, rate);
      return decay < this.workingThreshold;
    } catch {
      return false;
    }
  }

  /**
   * Parity with Python `should_archive` (py:274). Archives when:
   *   - older than 30 days, OR
   *   - importance_score < working_threshold
   */
  shouldArchive(memory: MemoryLike): boolean {
    try {
      const createdAt = memory.createdAt;
      if (createdAt) {
        const created = parseDate(createdAt, new Date());
        const elapsedMs = Date.now() - created.getTime();
        if (elapsedMs > 30 * 24 * 60 * 60 * 1000) return true;
      }
      const importance = Number(memory.importanceScore ?? 0.5);
      if (importance < this.workingThreshold) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parity with Python `get_review_schedule` (py:306). Returns either the
   * persisted schedule from `memory.metadata.intelligence.reviewSchedule`
   * (when `preferStored` is true) or a freshly computed one.
   */
  getReviewSchedule(
    memory: MemoryLike,
    opts: { preferStored?: boolean } = {},
  ): Date[] {
    try {
      const preferStored = opts.preferStored ?? true;
      if (preferStored) {
        const stored = this.parseStoredReviewSchedule(memory);
        if (stored && stored.length > 0) return stored;
      }
      const { importance, createdAt } = this.resolveReviewScheduleInputs(memory);
      return this.buildReviewSchedule(importance, createdAt);
    } catch {
      return [];
    }
  }

  // ─── Private helpers (parity with Python py:335-531) ────────────────────

  /**
   * Resolve effective decay strength S for a memory dict, applying per-type
   * multiplier + reinforcement bonus. Parity with Python `_resolve_decay_rate`
   * (py:372).
   */
  resolveDecayRate(memory: MemoryLike): number {
    const { metadata, intelligence } = this.resolveMetadataSections(memory);
    const memoryType = firstPresent(
      memory.memoryType as string | undefined,
      (metadata as Record<string, unknown> | null)?.memoryType as string | undefined,
      (intelligence as Record<string, unknown> | null)?.memoryType as string | undefined,
    );
    if (memoryType) {
      const baseRate = this.getDecayRateForType(String(memoryType));
      return this.applyReinforcement(memory, baseRate);
    }
    const stored = firstPresent(
      memory.decayRate as number | undefined,
      (metadata as Record<string, unknown> | null)?.decayRate as number | undefined,
      (intelligence as Record<string, unknown> | null)?.decayRate as number | undefined,
    );
    if (typeof stored === 'number' && stored > 0) {
      return this.applyReinforcement(memory, stored);
    }
    return this.applyReinforcement(memory, this.decayRate);
  }

  private loadDecayRateMultipliers(
    raw?: Record<string, number>,
  ): Record<string, number> {
    const multipliers: Record<string, number> = { ...DEFAULT_DECAY_RATE_MULTIPLIERS };
    if (raw) {
      for (const [k, v] of Object.entries(raw)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) multipliers[k] = n;
      }
    }
    return multipliers;
  }

  private getDecayRateForType(memoryType: string): number {
    const m = this.decayRateMultipliers[memoryType];
    if (m === undefined) return this.decayRate;
    return this.decayRate * m;
  }

  private resolveMetadataSections(memory: MemoryLike): {
    metadata: Record<string, unknown> | null;
    intelligence: Record<string, unknown> | null;
  } {
    const metadata = (memory.metadata ?? {}) as Record<string, unknown>;
    const intelligence =
      (metadata.intelligence as Record<string, unknown> | undefined) ??
      (memory.intelligence as Record<string, unknown> | undefined) ??
      {};
    return { metadata, intelligence };
  }

  private applyReinforcement(memory: MemoryLike, baseRate: number): number {
    const accessCount = this.resolveAccessCount(memory);
    const factor = this.resolveReinforcementFactor(memory);
    return baseRate * (1 + factor * Math.log1p(accessCount));
  }

  private resolveAccessCount(memory: MemoryLike): number {
    const { metadata, intelligence } = this.resolveMetadataSections(memory);
    const raw = firstPresent(
      memory.accessCount as number | undefined,
      (metadata as Record<string, unknown> | null)?.accessCount as number | undefined,
      (intelligence as Record<string, unknown> | null)?.accessCount as number | undefined,
    );
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? Math.max(n, 0) : 0;
  }

  private resolveReinforcementFactor(memory: MemoryLike): number {
    const { metadata, intelligence } = this.resolveMetadataSections(memory);
    const raw = firstPresent(
      memory.reinforcementFactor as number | undefined,
      (metadata as Record<string, unknown> | null)?.reinforcementFactor as number | undefined,
      (intelligence as Record<string, unknown> | null)?.reinforcementFactor as number | undefined,
      this.reinforcementFactor,
    );
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(n, 0) : 0;
  }

  private parseStoredReviewSchedule(memory: MemoryLike): Date[] | null {
    const { intelligence } = this.resolveMetadataSections(memory);
    const raw = (intelligence as Record<string, unknown> | null)?.reviewSchedule;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const times: Date[] = [];
    for (const item of raw) {
      if (!item) continue;
      const parsed = parseDate(String(item), new Date(0));
      if (parsed.getTime() !== 0) times.push(parsed);
    }
    return times.length > 0 ? times : null;
  }

  private resolveReviewScheduleInputs(memory: MemoryLike): {
    importance: number;
    createdAt: Date;
  } {
    const { metadata, intelligence } = this.resolveMetadataSections(memory);
    const importance = Number(
      firstPresent(
        memory.importanceScore as number | undefined,
        (metadata as Record<string, unknown> | null)?.importanceScore as number | undefined,
        (intelligence as Record<string, unknown> | null)?.importanceScore as number | undefined,
        0.5,
      ),
    );
    const createdAtRaw = firstPresent(
      memory.createdAt as string | undefined,
      (metadata as Record<string, unknown> | null)?.createdAt as string | undefined,
      (intelligence as Record<string, unknown> | null)?.createdAt as string | undefined,
    );
    return {
      importance: Number.isFinite(importance) ? importance : 0.5,
      createdAt: parseDate(createdAtRaw as string | undefined, new Date()),
    };
  }

  private buildReviewSchedule(importance: number, createdAt: Date): Date[] {
    const factor = this.reviewAdjustmentFactor;
    const floor = this.reviewIntervalMinHours;
    return this.reviewIntervals.map((intervalHours) => {
      const adjusted = Math.max(intervalHours * (1 - importance * factor), floor);
      return new Date(createdAt.getTime() + adjusted * 60 * 60 * 1000);
    });
  }
}
