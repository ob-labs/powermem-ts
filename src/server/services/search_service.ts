import type { Memory } from '../../powermem/core/memory.js';
import type { MemoryConfigInput } from '../../powermem/configs.js';
import type { MemoryOptions } from '../../powermem/types/options.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { Memory as MemoryClass } from '../../powermem/core/memory.js';

export interface SearchServiceCreateOptions {
  config?: MemoryConfigInput;
  memory?: Memory;
  memoryOptions?: MemoryOptions;
}

export class SearchService {
  constructor(private readonly memory: Memory) {}

  static async create(options: SearchServiceCreateOptions = {}): Promise<SearchService> {
    const memory = options.memory ?? await MemoryClass.create({
      ...(options.memoryOptions ?? {}),
      config: options.memoryOptions?.config ?? options.config ?? autoConfig(),
    });
    return new SearchService(memory);
  }

  search(query: string, options: Record<string, unknown> = {}) {
    return this.memory.search(query, options as never);
  }

  getMemory(): Memory {
    return this.memory;
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}
