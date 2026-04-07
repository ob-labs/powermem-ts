/**
 * Memory optimization prompts.
 * Port of Python powermem/prompts/optimization_prompts.py.
 */

export const MEMORY_COMPRESSION_PROMPT = `You are an expert memory organizer. Your task is to compress multiple related memories into a single, concise summary that preserves all key information.

Here are the memories to compress:
{memories}

Please provide a single compressed memory that merges these details.`;

export function buildCompressionPrompt(memories: string[]): string {
  const memoriesText = memories.map((m) => `- ${m}`).join('\n');
  return MEMORY_COMPRESSION_PROMPT.replace('{memories}', memoriesText);
}
