import type { Memory } from '../../powermem/core/memory.js';
import type {
  GetAllParams,
  FilterParams,
  UpdateParams,
} from '../../powermem/types/memory.js';

export class MemoryService {
  constructor(private readonly memory: Memory) {}

  getStorageType() {
    return this.memory.getStorageType();
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
}
