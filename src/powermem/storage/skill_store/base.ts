/**
 * SkillStoreBase — abstract interface for skill storage backends.
 * Round 5 port of Python `storage/skill_store/base.py`.
 */
export interface SkillRecord {
  id: string;
  title: string;
  description: string;
  tags?: string[];
  procedureData?: Record<string, unknown>;
  titleEmbedding?: number[];
  descriptionEmbedding?: number[];
  userId?: string;
  agentId?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillSearchParams {
  queryEmbedding?: number[];
  queryText?: string;
  limit?: number;
  userId?: string;
  agentId?: string;
  statusFilter?: string;
}

export interface SkillSearchHit extends SkillRecord {
  score: number;
}

export interface SkillStoreBase {
  /** Create the skills table if it doesn't exist. */
  createTable(): Promise<void>;

  /** Insert a skill. Returns the stored record (with assigned id). */
  add(params: {
    title: string;
    description: string;
    tags?: string[];
    procedureData?: Record<string, unknown>;
    titleEmbedding?: number[];
    descriptionEmbedding?: number[];
    userId?: string;
    agentId?: string;
  }): Promise<SkillRecord>;

  /** Update an existing skill. Returns true on success. */
  update(params: {
    skillId: string;
    title?: string;
    description?: string;
    tags?: string[];
    procedureData?: Record<string, unknown>;
    titleEmbedding?: number[];
    descriptionEmbedding?: number[];
  }): Promise<boolean>;

  /** Get a single skill by ID. Returns null when not found. */
  get(skillId: string): Promise<SkillRecord | null>;

  /** Search skills by embedding and/or fulltext. Returns list with scores. */
  search(params: SkillSearchParams): Promise<SkillSearchHit[]>;

  /** Update the status of a skill. Returns true if the row was changed. */
  updateStatus(skillId: string, status: string): Promise<boolean>;

  /** Delete a skill by ID. Returns true on success. */
  delete(skillId: string): Promise<boolean>;

  /** Release resources held by this store. */
  close(): Promise<void>;
}
