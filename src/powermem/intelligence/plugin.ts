/**
 * Intelligence plugin interfaces.
 * Port of Python powermem/intelligence/plugin.py.
 */
import type { VectorStoreSearchMatch } from '../storage/base.js';
import { IntelligenceManager, type IntelligenceConfig } from './manager.js';

export interface IntelligencePlugin {
  name: string;
  processMetadata?(content: string, metadata: Record<string, unknown>): Record<string, unknown>;
  processSearchResults?(results: VectorStoreSearchMatch[], query: string): VectorStoreSearchMatch[];
}

export class EbbinghausIntelligencePlugin implements IntelligencePlugin {
  readonly name = 'ebbinghaus';

  constructor(private readonly manager: IntelligenceManager) {}

  processMetadata(content: string, metadata: Record<string, unknown> = {}): Record<string, unknown> {
    return this.manager.processMetadata(content, metadata);
  }

  processSearchResults(results: VectorStoreSearchMatch[], _query: string): VectorStoreSearchMatch[] {
    return this.manager.processSearchResults(results);
  }
}

export function createIntelligencePlugin(
  pluginName: string | undefined,
  config: IntelligenceConfig = {},
): IntelligencePlugin | undefined {
  if (config.enabled === false && config.enableDecay === false) {
    return undefined;
  }

  const resolvedName = (pluginName ?? 'ebbinghaus').toLowerCase();
  const manager = new IntelligenceManager(config);

  if (resolvedName === 'ebbinghaus') {
    return new EbbinghausIntelligencePlugin(manager);
  }

  return undefined;
}
