/** Multimodal message content part. */
export interface ContentPart {
  type: 'text' | 'image_url' | 'audio';
  text?: string;
  image_url?: { url: string; detail?: string };
  audio_url?: string;
}

/** Multimodal message (matches OpenAI/LangChain message format). */
export interface MessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

/** Content can be a plain string or an array of multimodal messages. */
export type MemoryContent = string | MessageInput[];

export interface MemoryRecord {
  id: string;
  memoryId: string;
  content: string;
  userId?: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  scope?: string;
  category?: string;
  accessCount?: number;
}

export interface AddParams {
  content: MemoryContent;
  userId?: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  infer?: boolean;
  scope?: string;
  category?: string;
}

export interface SearchParams {
  query: string;
  userId?: string;
  agentId?: string;
  runId?: string;
  filters?: Record<string, unknown>;
  limit?: number;
  threshold?: number;
}

export interface UpdateParams {
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface GetAllParams {
  userId?: string;
  agentId?: string;
  runId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface FilterParams {
  userId?: string;
  agentId?: string;
  runId?: string;
}

export interface BatchItem {
  content: string;
  metadata?: Record<string, unknown>;
  scope?: string;
  category?: string;
}

export interface BatchOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  infer?: boolean;
  scope?: string;
  category?: string;
}
