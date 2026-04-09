import type { Memory } from '../../powermem/core/memory.js';
import type { MemoryConfigInput } from '../../powermem/configs.js';
import type {
  GetAllParams,
  FilterParams,
  UpdateParams,
} from '../../powermem/types/memory.js';
import type { MemoryOptions } from '../../powermem/types/options.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { Memory as MemoryClass } from '../../powermem/core/memory.js';

export interface MemoryServiceCreateOptions {
  config?: MemoryConfigInput;
  memory?: Memory;
  memoryOptions?: MemoryOptions;
}

export class MemoryService {
  constructor(private readonly memory: Memory) {}

  static async create(options: MemoryServiceCreateOptions = {}): Promise<MemoryService> {
    const memory = options.memory ?? await MemoryClass.create({
      ...(options.memoryOptions ?? {}),
      config: options.memoryOptions?.config ?? options.config ?? autoConfig(),
    });
    return new MemoryService(memory);
  }

  getStorageType() {
    return this.memory.getStorageType();
  }

  getMemory(): Memory {
    return this.memory;
  }

  add(content: string, options: Record<string, unknown> = {}) {
    return this.memory.add(content, options as never);
  }

  addBatch(memories: Array<{ content: string; metadata?: Record<string, unknown>; scope?: string; category?: string }>, options: Record<string, unknown> = {}) {
    return this.memory.addBatch(memories, options as never);
  }

  get(memoryId: string) {
    return this.memory.get(memoryId);
  }

  getAll(options: GetAllParams = {}) {
    return this.memory.getAll(options);
  }

  update(memoryId: string, content: string, options: Omit<UpdateParams, 'content'> = {}) {
    return this.memory.update(memoryId, content, options);
  }

  delete(memoryId: string) {
    return this.memory.delete(memoryId);
  }

  deleteAll(options: FilterParams = {}) {
    return this.memory.deleteAll(options);
  }

  count(options: FilterParams = {}) {
    return this.memory.count(options);
  }

  getStatistics(options: FilterParams = {}) {
    return this.memory.getStatistics(options);
  }

  getUsers(limit?: number) {
    return this.memory.getUsers(limit);
  }

  exportMemories(options: GetAllParams = {}) {
    return this.memory.exportMemories(options);
  }

  importMemories(memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>, options?: { infer?: boolean }) {
    return this.memory.importMemories(memories, options);
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}
