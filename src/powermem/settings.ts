/**
 * Settings utilities — env file resolution.
 * Port of Python powermem/settings.py.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve the default .env file path by checking common locations. */
export function getDefaultEnvFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
  ];
  // In ESM, use import.meta.url to resolve relative paths
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(thisDir, '..', '..', '.env'));
  } catch {
    // Fallback if import.meta.url not available (CJS)
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
