/**
 * SkillManager — extracts reusable procedural skills from conversations and
 * judges whether two skills should be merged. Round 5 real implementation.
 *
 * Python upstream (`intelligence/skill_manager.py`) wires the manager to a
 * LangChain LLM. TS mirrors that by accepting a `BaseChatModel` instance,
 * but exposes a narrower `SkillManagerLLM` interface so callers can pass
 * custom mocks without depending on LangChain internals.
 *
 * Python references:
 *   - distill(messages, today) -> List[Dict]
 *   - merge(existing, new)     -> Dict
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

export interface DistilledSkill {
  title: string;
  description: string;
  tags?: string[];
  procedure?: {
    prerequisites?: string[];
    steps?: string[];
    pitfalls?: string[];
  };
  [key: string]: unknown;
}

export interface SkillMergeResult {
  action: 'merge' | 'skip';
  title?: string;
  description?: string;
  procedure?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Narrow LLM interface SkillManager depends on. Decouples from LangChain so
 * tests can pass a fake.
 */
export interface SkillManagerLLM {
  invoke(messages: Array<{ _getType(): string; content: unknown }>): Promise<{ content: unknown }>;
}

const DISTILL_PROMPT = `Analyze the following conversation and distill reusable procedural skills.
For each skill, return JSON with this shape:
{"title": str, "description": str, "tags": [str], "procedure": {"prerequisites": [str], "steps": [str], "pitfalls": [str]}}

Return ONLY a JSON array of skills (empty array if no skills can be distilled).
Do not wrap in markdown fences.

Conversation:
`;

const MERGE_PROMPT = `Judge whether the following two skills should be merged or kept separate.

EXISTING:
"""
%s
"""

NEW:
"""
%s
"""

If they describe essentially the same procedure, return:
{"action": "merge", "title": "<merged title>", "description": "<merged description>", "procedure": {...}}

Otherwise return:
{"action": "skip"}

Return ONLY the JSON object, no markdown fences.`;

function removeCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Adapt a LangChain BaseChatModel to the narrow SkillManagerLLM interface.
 */
class LangChainSkillLLMAdapter implements SkillManagerLLM {
  constructor(private readonly llm: BaseChatModel) {}

  async invoke(messages: Array<{ _getType(): string; content: unknown }>): Promise<{ content: unknown }> {
    const lcMessages = messages.map((m) => new HumanMessage({ content: m.content as never }));
    const response = await this.llm.invoke(lcMessages);
    return { content: response.content };
  }
}

export interface SkillManagerOptions {
  /** Inject an LLM directly via the narrow interface (preferred for tests). */
  llm?: SkillManagerLLM;
  /** Inject a LangChain BaseChatModel; will be adapted automatically. */
  chatModel?: BaseChatModel;
}

export class SkillManager {
  private readonly llm?: SkillManagerLLM;

  constructor(optionsOrLlm: SkillManagerOptions | BaseChatModel = {}) {
    if ('invoke' in optionsOrLlm && typeof optionsOrLlm.invoke === 'function' && !('callModel' in optionsOrLlm)) {
      // Caller passed a SkillManagerLLM directly.
      this.llm = optionsOrLlm as SkillManagerLLM;
    } else if ('chatModel' in optionsOrLlm && optionsOrLlm.chatModel) {
      this.llm = new LangChainSkillLLMAdapter(optionsOrLlm.chatModel);
    } else if ('llm' in optionsOrLlm && optionsOrLlm.llm) {
      this.llm = optionsOrLlm.llm;
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('');
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  /**
   * Distill reusable procedural skills from a conversation. Parity with
   * Python `SkillManager.distill` (intelligence/skill_manager.py:30).
   *
   * Without an injected LLM, returns an empty list (matching Python's
   * "skill_manager unavailable" path).
   */
  async distill(
    messages: Array<Record<string, string>>,
    _today?: string,
  ): Promise<DistilledSkill[]> {
    if (!this.llm) return [];
    try {
      const conversationText = messages
        .map((m) => `${m.role ?? 'user'}: ${m.content ?? ''}`)
        .join('\n');
      const response = await this.llm.invoke([
        { _getType: () => 'human', content: DISTILL_PROMPT + conversationText },
      ]);
      const text = removeCodeFences(this.extractText(response.content));
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((s): s is DistilledSkill => typeof s === 'object' && s !== null && typeof s.title === 'string')
        .map((s) => ({
          title: s.title,
          description: String(s.description ?? ''),
          tags: Array.isArray(s.tags) ? s.tags : undefined,
          procedure: s.procedure as DistilledSkill['procedure'],
        }));
    } catch {
      return [];
    }
  }

  /**
   * Judge whether two skills should be merged or kept separate. Parity with
   * Python `SkillManager.merge` (intelligence/skill_manager.py:84).
   *
   * Without an injected LLM, returns `{ action: 'skip' }`.
   */
  async merge(existing: string, next: string): Promise<SkillMergeResult> {
    if (!this.llm) return { action: 'skip' };
    try {
      const prompt = MERGE_PROMPT.replace('%s', existing).replace('%s', next);
      const response = await this.llm.invoke([
        { _getType: () => 'human', content: prompt },
      ]);
      const text = removeCodeFences(this.extractText(response.content));
      const parsed = JSON.parse(text) as SkillMergeResult;
      if (parsed.action === 'merge' || parsed.action === 'skip') return parsed;
      return { action: 'skip' };
    } catch {
      return { action: 'skip' };
    }
  }
}
