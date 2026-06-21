export { computeDecayFactor, applyDecay, classifyMemoryType, EbbinghausAlgorithm } from './ebbinghaus-algorithm.js';
export type { DecayParams, ClassifyParams, MemoryType, EbbinghausConfig, ProcessMetadataResult, MemoryLike } from './ebbinghaus-algorithm.js';
export { MemoryOptimizer } from './memory-optimizer.js';
export type { DeduplicateResult, CompressResult } from './memory-optimizer.js';
export { ImportanceEvaluator } from './importance-evaluator.js';
export { IntelligenceManager } from './manager.js';
export type { IntelligenceConfig } from './manager.js';
export { IntelligentMemoryManager } from './intelligent-memory-manager.js';
export { EbbinghausIntelligencePlugin, createIntelligencePlugin } from './plugin.js';
export type { IntelligencePlugin } from './plugin.js';
// Round 4: SkillManager stub (parity with Python intelligence/skill_manager.py).
export { SkillManager } from './skill-manager.js';
export type { DistilledSkill, SkillMergeResult, SkillManagerLLM, SkillManagerOptions } from './skill-manager.js';
