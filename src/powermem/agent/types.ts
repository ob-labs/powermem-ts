/**
 * Agent memory type definitions.
 * Port of Python powermem/agent/types.py.
 */

export enum MemoryType {
  SEMANTIC = 'semantic',
  EPISODIC = 'episodic',
  PROCEDURAL = 'procedural',
  WORKING = 'working',
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  PUBLIC_SHARED = 'public_shared',
  PRIVATE_AGENT = 'private_agent',
  COLLABORATIVE = 'collaborative',
  GROUP_CONSENSUS = 'group_consensus',
}

export enum MemoryScope {
  PRIVATE = 'private',
  AGENT_GROUP = 'agent_group',
  USER_GROUP = 'user_group',
  PUBLIC = 'public',
  RESTRICTED = 'restricted',
}

export enum AccessPermission {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  ADMIN = 'admin',
}

export enum PrivacyLevel {
  STANDARD = 'standard',
  SENSITIVE = 'sensitive',
  CONFIDENTIAL = 'confidential',
}

export enum CollaborationType {
  SYNCHRONOUS = 'synchronous',
  ASYNCHRONOUS = 'asynchronous',
}

export enum CollaborationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

export enum CollaborationLevel {
  ISOLATED = 'isolated',
  COLLABORATIVE = 'collaborative',
}
