/**
 * CLI smoke tests — port of Python regression/test_powermem_cli.py (minimal subset).
 * Tests CLI commands via Commander's parseAsync with mocked argv.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

function runCli(args: string): string {
  try {
    return execSync(`npx tsx src/powermem/cli/main.ts ${args}`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    }).trim();
  } catch (err: any) {
    return (err.stdout ?? '').trim() + (err.stderr ?? '').trim();
  }
}

describe('CLI smoke tests', () => {
  it('pmem --version shows version', () => {
    const output = runCli('--version');
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('pmem --help shows usage', () => {
    const output = runCli('--help');
    expect(output).toContain('pmem');
    expect(output).toContain('config');
    expect(output).toContain('memory');
  });

  it('pmem config --help shows config commands', () => {
    const output = runCli('config --help');
    expect(output).toContain('show');
    expect(output).toContain('validate');
    expect(output).toContain('test');
  });

  it('pmem memory --help shows memory commands', () => {
    const output = runCli('memory --help');
    expect(output).toContain('add');
    expect(output).toContain('search');
    expect(output).toContain('list');
    expect(output).toContain('get');
    expect(output).toContain('delete');
    expect(output).toContain('delete-all');
  });

  it('pmem config validate passes with defaults', () => {
    const output = runCli('config validate');
    expect(output).toContain('valid');
  });

  it('pmem config show --json outputs JSON', () => {
    const output = runCli('config show --json');
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed.vectorStore).toBeDefined();
  });

  it('pmem config show --section llm shows LLM config', () => {
    const output = runCli('config show --section llm');
    expect(output).toContain('llm');
  });

  it('pmem config test shows component status', () => {
    const output = runCli('config test');
    expect(output).toContain('Database');
    expect(output).toContain('LLM');
    expect(output).toContain('Embedder');
  });

  // ── Phase B: stats, manage, shell ───────────────────────────────────

  it('pmem stats --help shows stats command', () => {
    const output = runCli('stats --help');
    expect(output).toContain('statistics');
  });

  it('pmem manage --help shows manage commands', () => {
    const output = runCli('manage --help');
    expect(output).toContain('backup');
    expect(output).toContain('restore');
    expect(output).toContain('cleanup');
  });

  it('pmem shell --help shows shell command', () => {
    const output = runCli('shell --help');
    expect(output).toContain('Interactive');
  });

  it('pmem manage backup --help shows backup options', () => {
    const output = runCli('manage backup --help');
    expect(output).toContain('--output');
    expect(output).toContain('--user-id');
    expect(output).toContain('--limit');
  });

  it('pmem manage restore --help shows restore options', () => {
    const output = runCli('manage restore --help');
    expect(output).toContain('--dry-run');
  });

  it('pmem manage cleanup --help shows cleanup options', () => {
    const output = runCli('manage cleanup --help');
    expect(output).toContain('--strategy');
    expect(output).toContain('--threshold');
  });
});
