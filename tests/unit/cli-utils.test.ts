/**
 * CLI utility tests — output formatting + envfile.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { truncate, formatMemoryTable, formatSearchTable, formatStats } from '../../src/powermem/cli/utils/output.js';
import { parseEnvLines, formatEnvValue, updateEnvFile, readEnvFile } from '../../src/powermem/cli/utils/envfile.js';

describe('output utils', () => {
  it('truncate shortens long strings', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a long string that exceeds limit', 15)).toBe('a long strin...');
  });

  it('formatMemoryTable shows header and rows', () => {
    const table = formatMemoryTable([
      { memoryId: '123', userId: 'alice', content: 'hello world' },
    ]);
    expect(table).toContain('ID');
    expect(table).toContain('123');
    expect(table).toContain('alice');
    expect(table).toContain('hello world');
  });

  it('formatMemoryTable handles empty', () => {
    expect(formatMemoryTable([])).toContain('no memories');
  });

  it('formatSearchTable shows scores', () => {
    const table = formatSearchTable([
      { memoryId: '1', score: 0.95, content: 'result' },
    ]);
    expect(table).toContain('0.950');
    expect(table).toContain('result');
  });

  it('formatStats shows totals', () => {
    const output = formatStats({
      totalMemories: 42,
      byType: { todo: 10, preference: 32 },
      ageDistribution: { '< 1 day': 5, '1-7 days': 37 },
      avgImportance: 0.65,
    });
    expect(output).toContain('42');
    expect(output).toContain('todo: 10');
    expect(output).toContain('0.65');
  });
});

describe('envfile utils', () => {
  it('parseEnvLines extracts key-value pairs', () => {
    const result = parseEnvLines([
      '# comment',
      'KEY1=value1',
      'KEY2="quoted value"',
      'export KEY3=val3',
      '',
    ]);
    expect(result).toEqual({ KEY1: 'value1', KEY2: 'quoted value', KEY3: 'val3' });
  });

  it('parseEnvLines first occurrence wins', () => {
    const result = parseEnvLines(['K=first', 'K=second']);
    expect(result.K).toBe('first');
  });

  it('formatEnvValue quotes when needed', () => {
    expect(formatEnvValue('simple')).toBe('simple');
    expect(formatEnvValue('has space')).toBe('"has space"');
    expect(formatEnvValue('has"quote')).toBe('"has\\"quote"');
    expect(formatEnvValue('')).toBe('');
  });

  it('updateEnvFile creates new file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envtest-'));
    const envPath = path.join(tmpDir, '.env');

    const result = updateEnvFile(envPath, { FOO: 'bar', BAZ: 'qux' });
    expect(result.appendedKeys).toContain('FOO');
    expect(result.appendedKeys).toContain('BAZ');

    const { parsed } = readEnvFile(envPath);
    expect(parsed.FOO).toBe('bar');
    expect(parsed.BAZ).toBe('qux');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('updateEnvFile updates existing keys', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envtest-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'EXISTING=old\nOTHER=keep\n');

    const result = updateEnvFile(envPath, { EXISTING: 'new', ADDED: 'fresh' });
    expect(result.updatedKeys).toContain('EXISTING');
    expect(result.appendedKeys).toContain('ADDED');
    expect(result.backupPath).toBeDefined();

    const { parsed } = readEnvFile(envPath);
    expect(parsed.EXISTING).toBe('new');
    expect(parsed.OTHER).toBe('keep');
    expect(parsed.ADDED).toBe('fresh');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('readEnvFile returns empty for nonexistent', () => {
    const { lines, parsed } = readEnvFile('/nonexistent/.env');
    expect(lines).toEqual([]);
    expect(parsed).toEqual({});
  });
});
