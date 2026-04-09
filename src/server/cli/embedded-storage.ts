import type { MemoryConfigInput } from '../../powermem/configs.js';

export function isEmbeddedStorage(memoryConfig: MemoryConfigInput): boolean {
  const provider = memoryConfig.vectorStore?.provider?.toLowerCase();
  if (!provider) return false;
  if (provider === 'sqlite' || provider === 'seekdb') {
    return true;
  }
  if (provider === 'oceanbase') {
    const host = String((memoryConfig.vectorStore?.config as Record<string, unknown> | undefined)?.host ?? '').trim();
    return host.length === 0;
  }
  return false;
}
