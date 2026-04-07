/**
 * Importance evaluator — rule-based + LLM-based importance scoring.
 * Port of Python powermem/intelligence/importance_evaluator.py.
 */

const IMPORTANT_KEYWORDS = [
  'important', 'critical', 'urgent', 'remember', 'note',
  'preference', 'like', 'dislike', 'hate', 'love',
  'password', 'secret', 'private', 'confidential',
];

const EMOTIONAL_WORDS = [
  'happy', 'sad', 'angry', 'excited', 'worried', 'scared',
  'love', 'hate', 'fear', 'joy', 'sorrow', 'anger',
];

export class ImportanceEvaluator {
  /** Evaluate importance of content (0-1). Rule-based fallback when no LLM. */
  evaluateImportance(
    content: string,
    metadata?: Record<string, unknown>,
    _context?: Record<string, unknown>
  ): number {
    return this.ruleBased(content, metadata);
  }

  /** Rule-based importance scoring (0-1). */
  private ruleBased(content: string, metadata?: Record<string, unknown>): number {
    let score = 0;
    const lower = content.toLowerCase();

    // Length factor
    if (content.length > 100) score += 0.1;
    else if (content.length > 50) score += 0.05;

    // Keyword importance
    for (const kw of IMPORTANT_KEYWORDS) {
      if (lower.includes(kw)) score += 0.1;
    }

    // Emotional words
    for (const w of EMOTIONAL_WORDS) {
      if (lower.includes(w)) score += 0.05;
    }

    // Punctuation signals
    if (content.includes('?')) score += 0.05;
    if (content.includes('!')) score += 0.05;

    // Metadata factors
    if (metadata) {
      if (metadata.priority === 'high') score += 0.2;
      else if (metadata.priority === 'medium') score += 0.1;
      if (metadata.tags) score += 0.05;
    }

    return Math.min(score, 1.0);
  }
}
