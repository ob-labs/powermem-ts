/**
 * Query rewriter — LLM-based query expansion with user profile context.
 * Port of Python powermem/user_memory/query_rewrite/rewriter.py.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface QueryRewriteResult {
  originalQuery: string;
  rewrittenQuery: string;
  isRewritten: boolean;
  profileUsed?: string;
  error?: string;
}

export class QueryRewriter {
  private readonly enabled: boolean;
  private readonly customInstructions?: string;

  constructor(
    private readonly llm: BaseChatModel,
    config: Record<string, unknown> = {}
  ) {
    this.enabled = (config.enabled as boolean) ?? false;
    this.customInstructions = config.prompt as string | undefined;
  }

  async rewrite(query: string, profileContent?: string): Promise<QueryRewriteResult> {
    if (!this.enabled || !profileContent || query.length < 3) {
      return { originalQuery: query, rewrittenQuery: query, isRewritten: false };
    }

    try {
      const systemPrompt = this.customInstructions ??
        'You are a query expansion assistant. Given a user query and their profile, rewrite the query to improve search recall. Return only the rewritten query text.';

      const userPrompt = `User profile:\n${profileContent}\n\nOriginal query: "${query}"\n\nRewrite the query to include relevant context from the profile. Return only the rewritten query.`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const rewritten = typeof response.content === 'string'
        ? response.content.trim()
        : query;

      return {
        originalQuery: query,
        rewrittenQuery: rewritten || query,
        isRewritten: rewritten !== query && rewritten.length > 0,
        profileUsed: profileContent.slice(0, 100),
      };
    } catch (err) {
      return {
        originalQuery: query,
        rewrittenQuery: query,
        isRewritten: false,
        error: String(err),
      };
    }
  }
}
