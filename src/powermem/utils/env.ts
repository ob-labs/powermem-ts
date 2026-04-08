import fs from 'node:fs';
import path from 'node:path';

/** 读取并注入 .env 文件（同文件内后写覆盖前写，但不覆盖已有环境变量） */
export function loadEnvFile(envFile: string = '.env'): void {
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) return;

  const content = fs.readFileSync(resolved, 'utf-8');
  const parsed: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const rawKey = trimmed.slice(0, eq).trim();
    const key = rawKey.startsWith('export ') ? rawKey.slice('export '.length).trim() : rawKey;
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');

    parsed[key] = val;
  }

  for (const [key, val] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}
