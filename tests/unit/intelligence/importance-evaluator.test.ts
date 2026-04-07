/**
 * Importance evaluator tests — port of Python importance evaluation.
 */
import { describe, it, expect } from 'vitest';
import { ImportanceEvaluator } from '../../../src/powermem/intelligence/importance-evaluator.js';

describe('ImportanceEvaluator', () => {
  const evaluator = new ImportanceEvaluator();

  it('short trivial content scores low', () => {
    const score = evaluator.evaluateImportance('Hi.');
    expect(score).toBeLessThan(0.2);
  });

  it('content with important keywords scores higher', () => {
    const score = evaluator.evaluateImportance('This is critical and urgent information to remember!');
    expect(score).toBeGreaterThan(0.3);
  });

  it('long content scores higher than short', () => {
    const short = evaluator.evaluateImportance('short');
    const long = evaluator.evaluateImportance('a'.repeat(150) + ' with important details');
    expect(long).toBeGreaterThan(short);
  });

  it('emotional content adds to score', () => {
    const neutral = evaluator.evaluateImportance('The meeting is at 3pm');
    const emotional = evaluator.evaluateImportance('I love this project and am excited about it!');
    expect(emotional).toBeGreaterThan(neutral);
  });

  it('high priority metadata boosts score', () => {
    const noMeta = evaluator.evaluateImportance('content');
    const highPriority = evaluator.evaluateImportance('content', { priority: 'high' });
    expect(highPriority).toBeGreaterThan(noMeta);
  });

  it('score is capped at 1.0', () => {
    // Load up with every signal
    const score = evaluator.evaluateImportance(
      'important critical urgent remember love hate! ? ' + 'a'.repeat(200),
      { priority: 'high', tags: ['test'] }
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('returns 0 for empty string', () => {
    const score = evaluator.evaluateImportance('');
    expect(score).toBe(0);
  });
});
