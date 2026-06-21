/**
 * Parity tests: round 4 config schema additions.
 *
 * Validates that the new fields (decayRateMultipliers, forgottenScoreMultiplier,
 * reviewAdjustmentFactor, reviewIntervalMinHours, audioLlm, skillStore,
 * sourceStore) are accepted by parseMemoryConfig with Python-compatible
 * defaults.
 *
 * Python references:
 *   - configs.py:43 decay_rate_multipliers
 *   - configs.py:58 forgotten_score_multiplier
 *   - configs.py:77 review_adjustment_factor
 *   - configs.py:81 review_interval_min_hours
 *   - configs.py:229 SkillStoreConfig
 *   - configs.py:237 SourceStoreConfig
 *   - configs.py:321 audio_llm
 */
import { describe, it, expect } from 'vitest';
import { parseMemoryConfig, validateConfig } from '../../src/powermem/configs.js';
import { SkillManager, EbbinghausAlgorithm, classifyMemoryType, IntelligenceManager } from '../../src/powermem/intelligence/index.js';

describe('parity / IntelligentMemoryConfig new fields (round 4)', () => {
  it('decayRateMultipliers defaults to Python-compatible map', () => {
    const cfg = parseMemoryConfig({});
    expect(cfg.intelligentMemory?.decayRateMultipliers).toEqual({
      working: 1,
      short_term: 7,
      long_term: 60,
    });
  });

  it('forgottenScoreMultiplier defaults to 0.1 (Python configs.py:58)', () => {
    const cfg = parseMemoryConfig({});
    expect(cfg.intelligentMemory?.forgottenScoreMultiplier).toBe(0.1);
  });

  it('reviewAdjustmentFactor defaults to 0.3 (Python configs.py:77)', () => {
    const cfg = parseMemoryConfig({});
    expect(cfg.intelligentMemory?.reviewAdjustmentFactor).toBe(0.3);
  });

  it('reviewIntervalMinHours defaults to 0.5 (Python configs.py:81)', () => {
    const cfg = parseMemoryConfig({});
    expect(cfg.intelligentMemory?.reviewIntervalMinHours).toBe(0.5);
  });

  it('accepts explicit overrides for all new fields', () => {
    const cfg = parseMemoryConfig({
      intelligentMemory: {
        enabled: true,
        decayRateMultipliers: { working: 2, short_term: 14, long_term: 120 },
        forgottenScoreMultiplier: 0.05,
        reviewAdjustmentFactor: 0.4,
        reviewIntervalMinHours: 1.0,
      },
    });
    expect(cfg.intelligentMemory?.decayRateMultipliers).toEqual({
      working: 2,
      short_term: 14,
      long_term: 120,
    });
    expect(cfg.intelligentMemory?.forgottenScoreMultiplier).toBe(0.05);
    expect(cfg.intelligentMemory?.reviewAdjustmentFactor).toBe(0.4);
    expect(cfg.intelligentMemory?.reviewIntervalMinHours).toBe(1.0);
  });
});

describe('parity / MemoryConfig top-level additions (round 4)', () => {
  it('audioLlm is optional and accepts a full provider config', () => {
    const cfg = parseMemoryConfig({
      audioLlm: { provider: 'qwen', config: { model: 'qwen-asr' } },
    });
    expect(cfg.audioLlm?.provider).toBe('qwen');
    expect((cfg.audioLlm?.config as Record<string, unknown>)?.model).toBe('qwen-asr');
  });

  it('skillStore accepts SkillStoreConfig schema', () => {
    const cfg = parseMemoryConfig({
      skillStore: {
        enabled: true,
        collectionName: 'memories_skills',
        similarityThreshold: 0.05,
        indexType: 'hnsw',
      },
    });
    expect(cfg.skillStore?.enabled).toBe(true);
    expect(cfg.skillStore?.collectionName).toBe('memories_skills');
    expect(cfg.skillStore?.similarityThreshold).toBe(0.05);
    expect(cfg.skillStore?.indexType).toBe('hnsw');
  });

  it('skillStore defaults match Python configs.py:229', () => {
    const cfg = parseMemoryConfig({ skillStore: {} });
    expect(cfg.skillStore?.enabled).toBe(false);
    expect(cfg.skillStore?.similarityThreshold).toBe(0.03);
  });

  it('sourceStore accepts SourceStoreConfig schema', () => {
    const cfg = parseMemoryConfig({
      sourceStore: { enabled: true, collectionName: 'memories_sources' },
    });
    expect(cfg.sourceStore?.enabled).toBe(true);
    expect(cfg.sourceStore?.collectionName).toBe('memories_sources');
  });

  it('sourceStore defaults match Python configs.py:237', () => {
    const cfg = parseMemoryConfig({ sourceStore: {} });
    expect(cfg.sourceStore?.enabled).toBe(false);
  });

  it('validateConfig still accepts configs with new fields', () => {
    expect(
      validateConfig({
        vectorStore: { provider: 'sqlite', config: {} },
        llm: { provider: 'qwen', config: {} },
        embedder: { provider: 'qwen', config: {} },
        audioLlm: { provider: 'qwen', config: {} },
        skillStore: { enabled: false },
        sourceStore: { enabled: false },
      }),
    ).toBe(true);
  });
});

describe('parity / EbbinghausAlgorithm class (round 5 real impl)', () => {
  it('classifyMemoryType matches Python thresholds by default', () => {
    expect(classifyMemoryType({ retention: 0.2 })).toBe('working');
    expect(classifyMemoryType({ retention: 0.5 })).toBe('working');
    expect(classifyMemoryType({ retention: 0.7 })).toBe('short_term');
    expect(classifyMemoryType({ retention: 0.9 })).toBe('long_term');
  });

  it('EbbinghausAlgorithm.calculateDecay returns value in [0, 1] for 24h-old memory', () => {
    const algo = new EbbinghausAlgorithm();
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 24h ago
    // Round 5 signature: calculateDecay(createdAt, decayRate?)
    const decay = algo.calculateDecay(createdAt);
    expect(decay).toBeGreaterThanOrEqual(0);
    expect(decay).toBeLessThanOrEqual(1);
    // Python formula: exp(-24 / (24 * 1.5)) = exp(-1/1.5) ≈ 0.513
    expect(decay).toBeLessThan(1);
    expect(decay).toBeGreaterThan(0.4);
  });

  it('EbbinghausAlgorithm.calculateRelevance returns keyword-overlap score', () => {
    const algo = new EbbinghausAlgorithm();
    // Round 5 signature: calculateRelevance(memory, query)
    const score = algo.calculateRelevance({ content: 'hello world foo bar' }, 'hello world');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(algo.calculateRelevance({ content: 'unrelated' }, 'hello')).toBe(0);
  });

  it('EbbinghausAlgorithm.processMemoryMetadata enriches with intelligence + memory_management', () => {
    const algo = new EbbinghausAlgorithm();
    // Round 5 signature: processMemoryMetadata(content, importance, memoryType)
    const result = algo.processMemoryMetadata('hello world', 0.8, 'short_term');
    expect(result.intelligence.importanceScore).toBe(0.8);
    expect(result.intelligence.memoryType).toBe('short_term');
    expect(result.intelligence.initialRetention).toBeGreaterThan(0);
    expect(result.intelligence.reviewSchedule).toBeInstanceOf(Array);
    expect(result.intelligence.reviewSchedule.length).toBeGreaterThan(0);
    expect(result.memoryManagement.isActive).toBe(true);
    expect(result.createdAt).toBeTruthy();
  });

  it('EbbinghausAlgorithm.shouldPromote / shouldForget / shouldArchive return booleans', () => {
    const algo = new EbbinghausAlgorithm();
    const oldIso = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    const newIso = new Date().toISOString();
    expect(algo.shouldPromote({ accessCount: 5, createdAt: newIso })).toBe(true);
    expect(algo.shouldPromote({ accessCount: 0, createdAt: newIso, importanceScore: 0.1 })).toBe(false);
    expect(algo.shouldArchive({ createdAt: oldIso, importanceScore: 0.5 })).toBe(false); // 2 days, importance ok
    expect(algo.shouldForget({ createdAt: oldIso })).toBe(true); // 48h decay below working_threshold 0.3
  });

  it('EbbinghausAlgorithm.getReviewSchedule returns schedule list', () => {
    const algo = new EbbinghausAlgorithm();
    const schedule = algo.getReviewSchedule({
      createdAt: new Date().toISOString(),
      importanceScore: 0.5,
    });
    expect(Array.isArray(schedule)).toBe(true);
    expect(schedule.length).toBeGreaterThan(0);
  });
});

describe('parity / SkillManager (round 5 real impl)', () => {
  it('SkillManager without LLM returns empty list from distill', async () => {
    const sm = new SkillManager();
    expect(await sm.distill([{ role: 'user', content: 'hi' }])).toEqual([]);
  });

  it('SkillManager without LLM returns action=skip from merge', async () => {
    const sm = new SkillManager();
    const result = await sm.merge('existing', 'new');
    expect(result.action).toBe('skip');
  });

  it('SkillManager with fake LLM distills skills from JSON response', async () => {
    const fakeLlm = {
      async invoke(_msgs: unknown): Promise<{ content: unknown }> {
        return {
          content: JSON.stringify([
            {
              title: 'Deploy app',
              description: 'Standard deployment procedure',
              tags: ['deploy', 'ops'],
              procedure: { steps: ['push', 'verify'] },
            },
          ]),
        };
      },
    };
    const sm = new SkillManager({ llm: fakeLlm });
    const skills = await sm.distill([{ role: 'user', content: 'how to deploy?' }]);
    expect(skills).toHaveLength(1);
    expect(skills[0].title).toBe('Deploy app');
    expect(skills[0].procedure?.steps).toEqual(['push', 'verify']);
  });

  it('SkillManager with fake LLM handles merge action', async () => {
    const fakeLlm = {
      async invoke(_msgs: unknown): Promise<{ content: unknown }> {
        return {
          content: JSON.stringify({
            action: 'merge',
            title: 'Merged skill',
            description: 'Combined description',
            procedure: { steps: ['one'] },
          }),
        };
      },
    };
    const sm = new SkillManager({ llm: fakeLlm });
    const result = await sm.merge('existing', 'new');
    expect(result.action).toBe('merge');
    expect(result.title).toBe('Merged skill');
  });

  it('SkillManager with fake LLM handles invalid JSON gracefully', async () => {
    const fakeLlm = {
      async invoke(_msgs: unknown): Promise<{ content: unknown }> {
        return { content: 'not valid json {' };
      },
    };
    const sm = new SkillManager({ llm: fakeLlm });
    expect(await sm.distill([{ role: 'user', content: 'hi' }])).toEqual([]);
    expect((await sm.merge('a', 'b')).action).toBe('skip');
  });
});

describe('parity / IntelligenceManager new methods (round 4)', () => {
  it('optimizeMemories returns empty stats by default', () => {
    const mgr = new IntelligenceManager();
    const result = mgr.optimizeMemories();
    expect(result).toEqual({ compressed: 0, deduplicated: 0 });
  });

  it('getMemoryStats returns expected shape', () => {
    const mgr = new IntelligenceManager();
    const stats = mgr.getMemoryStats();
    expect(stats).toHaveProperty('totalMemories');
    expect(stats).toHaveProperty('byType');
    expect(stats).toHaveProperty('avgImportance');
    expect(stats).toHaveProperty('ageDistribution');
  });
});
