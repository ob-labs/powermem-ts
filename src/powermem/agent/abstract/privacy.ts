/**
 * Privacy strategy abstract interface.
 */
import type { PrivacyLevel } from '../types.js';

export interface PrivacyStrategy {
  initialize(): Promise<void>;
  getPrivacyLevel(memoryId: string): Promise<PrivacyLevel>;
  setPrivacyLevel(memoryId: string, level: PrivacyLevel, setBy: string): Promise<Record<string, unknown>>;
  checkPrivacyAccess(agentId: string, memoryId: string): Promise<boolean>;
}
