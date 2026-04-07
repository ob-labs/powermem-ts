/**
 * Importance evaluation prompts.
 * Port of Python powermem/prompts/importance_evaluation.py.
 */

export const IMPORTANCE_SYSTEM_PROMPT = `You are an AI assistant that evaluates the importance of memory content on a scale from 0.0 to 1.0.

Criteria:
- Relevance: How relevant is this to the user's needs?
- Novelty: How new or unique is this information?
- Emotional Impact: How emotionally significant?
- Actionability: How actionable or useful?
- Factual Value: How factual and reliable?
- Personal Significance: How personally important to the user?

Return JSON: {"importance_score": 0.0-1.0, "reasoning": "..."}`;

export function getImportanceEvaluationPrompt(
  content: string,
  metadata?: Record<string, unknown>,
  _context?: Record<string, unknown>
): string {
  let prompt = `Evaluate the importance of this memory content:\n\n"${content}"`;
  if (metadata && Object.keys(metadata).length > 0) {
    prompt += `\n\nMetadata: ${JSON.stringify(metadata)}`;
  }
  prompt += '\n\nReturn JSON: {"importance_score": 0.0-1.0}';
  return prompt;
}
