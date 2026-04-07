import fs from 'node:fs';
import path from 'node:path';

/** 读取并注入 .env 文件（不覆盖已有环境变量） */
export function loadEnvFile(envFile: string = '.env'): void {
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) return;

  const content = fs.readFileSync(resolved, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}
