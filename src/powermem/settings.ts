/**
 * Settings utilities — env file resolution.
 * Port of Python powermem/settings.py.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findDotenvUpwards(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Resolve the default .env file path by checking common locations. */
export function getDefaultEnvFile(): string | undefined {
  const candidates = [path.resolve(process.cwd(), '.env')];
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(thisDir, '..', '..');
    candidates.push(path.resolve(projectRoot, '.env'));
    candidates.push(path.resolve(projectRoot, 'examples', 'configs', '.env'));
  } catch {
    // Ignore ESM path resolution failures and fall back to cwd search.
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return findDotenvUpwards(process.cwd());
}
