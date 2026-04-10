export interface APIResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
  timestamp: string;
}

export interface MemoryResponse {
  memory_id: string;
  id: string;
  content: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  metadata: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface MemoryListResponse {
  memories: MemoryResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserProfileResponse {
  user_id: string;
  profile_content?: string | null;
  topics?: Record<string, unknown> | null;
  updated_at?: string | null;
}
