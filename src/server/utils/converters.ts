import type { MemoryRecord } from '../../powermem/types/memory.js';
import type { UserProfile } from '../../powermem/user_memory/storage/base.js';
import type { MemoryListResponse, MemoryResponse, UserProfileResponse } from '../models/response.js';

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type MemoryLike = Partial<MemoryRecord> & {
  id?: string;
  memoryId?: string;
  metadata?: Record<string, unknown>;
};

export function memoryToResponse(memoryData: MemoryLike): MemoryResponse {
  const memoryId = memoryData.memoryId ?? memoryData.id;
  return {
    memory_id: String(memoryId ?? ''),
    id: String(memoryId ?? ''),
    content: String(memoryData.content ?? ''),
    user_id: typeof memoryData.userId === 'string' ? memoryData.userId : undefined,
    agent_id: typeof memoryData.agentId === 'string' ? memoryData.agentId : undefined,
    run_id: typeof memoryData.runId === 'string' ? memoryData.runId : undefined,
    metadata: (memoryData.metadata as Record<string, unknown> | undefined) ?? {},
    created_at: toIsoString(memoryData.createdAt),
    updated_at: toIsoString(memoryData.updatedAt),
  };
}

export function memoryListToResponse(memories: MemoryRecord[], total: number, limit: number, offset: number): MemoryListResponse {
  return {
    memories: memories.map((memory) => memoryToResponse(memory)),
    total,
    limit,
    offset,
  };
}

export function userProfileToResponse(userId: string, profileData?: Partial<UserProfile> | null): UserProfileResponse {
  if (!profileData) {
    return {
      user_id: userId,
      profile_content: null,
      topics: null,
      updated_at: null,
    };
  }

  return {
    user_id: userId,
    profile_content: profileData.profileContent ?? null,
    topics: profileData.topics ?? null,
    updated_at: toIsoString(profileData.updatedAt),
  };
}
