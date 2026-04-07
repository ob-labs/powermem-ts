/**
 * Base LLM class — port of Python integrations/llm/base.py.
 * In TS we use LangChain's BaseChatModel, so this is a thin contract.
 */
export interface LLMProvider {
  generateResponse(
    messages: Array<{ role: string; content: string }>,
    options?: { responseFormat?: { type: string }; temperature?: number; maxTokens?: number }
  ): Promise<string>;
}
