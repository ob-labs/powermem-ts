import type { Memory } from '../../powermem/core/memory.js';

export class SearchService {
  constructor(private readonly memory: Memory) {}

  search(query: string, options: Record<string, unknown> = {}) {
    return this.memory.search(query, options as never);
  }
}
