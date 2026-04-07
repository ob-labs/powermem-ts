/**
 * .env file management utilities.
 * Port of Python powermem/cli/utils/envfile.py.
 */
import fs from 'node:fs';
import path from 'node:path';

const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

export function parseEnvLines(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(ENV_LINE_RE);
    if (match && !(match[1] in result)) {
      result[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

export function formatEnvValue(value: string): string {
  if (!value) return '';
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

export interface EnvUpdateResult {
  path: string;
  backupPath?: string;
  updatedKeys: string[];
  appendedKeys: string[];
}

export function updateEnvFile(
  filePath: string,
  updates: Record<string, string>,
  sectionTitle = '# PowerMem Configuration'
): EnvUpdateResult {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const result: EnvUpdateResult = {
    path: filePath,
    updatedKeys: [],
    appendedKeys: [],
  };

  let lines: string[] = [];
  if (fs.existsSync(filePath)) {
    // Backup
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    result.backupPath = `${filePath}.bak.${ts}`;
    fs.copyFileSync(filePath, result.backupPath);
    lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  }

  const remaining = { ...updates };

  // Update existing keys
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ENV_LINE_RE);
    if (match && match[1] in remaining) {
      lines[i] = `${match[1]}=${formatEnvValue(remaining[match[1]])}`;
      result.updatedKeys.push(match[1]);
      delete remaining[match[1]];
    }
  }

  // Append new keys
  const newKeys = Object.keys(remaining);
  if (newKeys.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(sectionTitle);
    for (const key of newKeys) {
      lines.push(`${key}=${formatEnvValue(remaining[key])}`);
      result.appendedKeys.push(key);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'));
  return result;
}

export function readEnvFile(filePath: string): { lines: string[]; parsed: Record<string, string> } {
  if (!fs.existsSync(filePath)) return { lines: [], parsed: {} };
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  return { lines, parsed: parseEnvLines(lines) };
}
