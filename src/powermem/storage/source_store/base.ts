/**
 * SourceStoreBase — abstract interface for source storage (fact-source
 * linking). Round 5 port of Python `storage/source_store/base.py`.
 *
 * A *source* represents the origin of one or more downstream records — for
 * example a conversation turn, a file upload, or an API call. Each memory /
 * skill record can optionally reference the source it was extracted from via
 * a dedicated link table.
 */
export interface SourceRecord {
  id: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  runId?: string;
  actorId?: string;
  createdAt: string;
}

export interface SourceStoreBase {
  /** Create the sources + link tables if they do not exist. */
  createTable(): Promise<void>;

  /**
   * Insert a source record. The four scope columns mirror the scope
   * dimensions on the main memory table so that sources can be queried /
   * purged along the same axes as the records they spawn.
   */
  createSource(params: {
    sourceType: string;
    content: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    agentId?: string;
    runId?: string;
    actorId?: string;
  }): Promise<SourceRecord>;

  /** Retrieve a source by its primary key. Returns null when not found. */
  getSource(sourceId: string): Promise<SourceRecord | null>;

  // ─── Memory linking ────────────────────────────────────────────────────

  /**
   * Create a link between a source and a memory record. Idempotent on
   * (sourceId, memoryId). Returns true if a new link was created; false if
   * the link already existed.
   */
  linkMemory(sourceId: string, memoryId: string): Promise<boolean>;

  /**
   * Remove a link between a source and a memory record. Returns true if a
   * link was actually removed.
   */
  unlinkMemory(sourceId: string, memoryId: string): Promise<boolean>;

  /** Return all sources linked to a given memory record. */
  getSourcesForMemory(memoryId: string): Promise<SourceRecord[]>;

  // ─── Skill linking ─────────────────────────────────────────────────────

  linkSkill(sourceId: string, skillId: string): Promise<boolean>;
  unlinkSkill(sourceId: string, skillId: string): Promise<boolean>;
  getSourcesForSkill(skillId: string): Promise<SourceRecord[]>;

  // ─── Reverse queries ───────────────────────────────────────────────────

  /** Return all memory IDs linked to a given source. */
  getMemoriesForSource(sourceId: string): Promise<string[]>;

  /** Return all skill IDs linked to a given source. */
  getSkillsForSource(sourceId: string): Promise<string[]>;

  /** Delete a source and all its memory/skill links. Returns true on success. */
  deleteSource(sourceId: string): Promise<boolean>;

  /** Release resources held by this store. */
  close(): Promise<void>;
}
