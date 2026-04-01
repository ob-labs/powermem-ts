import { Embeddings } from '@langchain/core/embeddings';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';

/**
 * Mock Embeddings — deterministic, uses character frequency to generate vectors.
 * Similar strings produce similar vectors (rough but sufficient for testing).
 */
export class MockEmbeddings extends Embeddings {
  readonly dimension: number;
  readonly calls: string[] = [];

  constructor(dimension = 8) {
    super({});
    this.dimension = dimension;
  }

  async embedQuery(text: string): Promise<number[]> {
    this.calls.push(text);
    return this.computeEmbedding(text);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    this.calls.push(...documents);
    return documents.map((d) => this.computeEmbedding(d));
  }

  private computeEmbedding(text: string): number[] {
    const vec = new Array(this.dimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % this.dimension] += text.charCodeAt(i) / 256;
    }
    // Normalize
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    }
    return vec;
  }
}

/**
 * Mock LLM — returns pre-configured responses in order.
 */
export class MockLLM extends BaseChatModel {
  private responses: string[];
  private callIndex = 0;
  readonly calls: BaseMessage[][] = [];

  constructor(responses: string[]) {
    super({});
    this.responses = responses;
  }

  _llmType(): string {
    return 'mock';
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    this.calls.push(messages);
    const text = this.responses[this.callIndex] ?? '{}';
    this.callIndex = Math.min(this.callIndex + 1, this.responses.length - 1);
    return {
      generations: [
        {
          message: new AIMessage(text),
          text,
        },
      ],
    };
  }
}
