import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getFactRetrievalPrompt, buildUpdateMemoryPrompt } from '../prompts/intelligent-memory.js';

export interface MemoryAction {
  id: string;
  text: string;
  event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
  oldMemory?: string;
}

/** Strip ```json ... ``` wrappers from LLM output. */
function removeCodeBlocks(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

export class Inferrer {
  private customFactExtractionPrompt?: string;
  private customUpdateMemoryPrompt?: string;

  constructor(private readonly llm: BaseChatModel) {}

  setCustomPrompts(factPrompt?: string, updatePrompt?: string): void {
    this.customFactExtractionPrompt = factPrompt;
    this.customUpdateMemoryPrompt = updatePrompt;
  }

  async extractFacts(content: string): Promise<string[]> {
    const systemPrompt = getFactRetrievalPrompt(this.customFactExtractionPrompt);
    const userPrompt = `Input:\n${content}`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const cleaned = removeCodeBlocks(text);

    try {
      const parsed = JSON.parse(cleaned) as { facts?: unknown };
      if (Array.isArray(parsed.facts)) {
        return parsed.facts.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
      }
      if (typeof parsed.facts === 'string' && parsed.facts.trim().length > 0) {
        return [parsed.facts.trim()];
      }
      return [];
    } catch {
      return [];
    }
  }

  async decideActions(
    facts: string[],
    existingMemories: Array<{ id: string; text: string }>,
    _idMapping: Map<string, string>
  ): Promise<MemoryAction[]> {
    const prompt = buildUpdateMemoryPrompt(
      existingMemories,
      facts,
      this.customUpdateMemoryPrompt
    );

    const response = await this.llm.invoke([new HumanMessage(prompt)]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const cleaned = removeCodeBlocks(text);

    try {
      const parsed = JSON.parse(cleaned) as {
        memory?: Array<{
          id: string;
          text: string;
          event: string;
          old_memory?: string;
        }>;
      };

      return (parsed.memory ?? []).map((action) => ({
        id: action.id,
        text: action.text,
        event: action.event.toUpperCase() as MemoryAction['event'],
        oldMemory: action.old_memory,
      }));
    } catch {
      return [];
    }
  }
}
