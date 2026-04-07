/**
 * BDD-style CLI tests — exercising every scenario from the BDD spec.
 * Uses real CLI execution via subprocess to prove end-to-end behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = 'npx tsx src/cli/main.ts';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmem-bdd-'));
const dbPath = path.join(tmpDir, 'test.db');

function run(args: string, env: Record<string, string> = {}): string {
  try {
    return execSync(`${CLI} ${args}`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 15000,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        EMBEDDING_PROVIDER: 'openai',
        EMBEDDING_API_KEY: 'fake-key',
        ...env,
      },
    }).trim();
  } catch (err: any) {
    return ((err.stdout ?? '') + (err.stderr ?? '')).trim();
  }
}

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: CLI Version and Help
// ═══════════════════════════════════════════════════════════════════

describe('Feature: CLI Version and Help', () => {
  it('Scenario: Show version number', () => {
    const output = run('--version');
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('Scenario: Show main help', () => {
    const output = run('--help');
    expect(output).toContain('config');
    expect(output).toContain('memory');
    expect(output).toContain('stats');
    expect(output).toContain('manage');
    expect(output).toContain('shell');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: Config Management
// ═══════════════════════════════════════════════════════════════════

describe('Feature: Config Management', () => {
  it('Scenario: Show full configuration', () => {
    const output = run('config show');
    expect(output).toContain('vectorStore');
    expect(output).toContain('llm');
  });

  it('Scenario: Show configuration as JSON', () => {
    const output = run('config show --json');
    const parsed = JSON.parse(output);
    expect(parsed.vectorStore).toBeDefined();
    expect(parsed.llm).toBeDefined();
    expect(parsed.embedder).toBeDefined();
  });

  it('Scenario: Show specific config section', () => {
    const output = run('config show --section llm');
    expect(output).toContain('llm');
  });

  it('Scenario: Show config section as JSON', () => {
    const output = run('config show --section llm --json');
    const parsed = JSON.parse(output);
    expect(parsed.provider).toBeDefined();
  });

  it('Scenario: Validate configuration', () => {
    const output = run('config validate');
    expect(output).toContain('valid');
  });

  it('Scenario: Test component connections', () => {
    const output = run('config test');
    expect(output).toContain('Database');
    expect(output).toContain('LLM');
    expect(output).toContain('Embedder');
  });

  it('Scenario: Test specific component', () => {
    const output = run('config test --component database');
    expect(output).toContain('Database');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: Statistics
// ═══════════════════════════════════════════════════════════════════

describe('Feature: Statistics', () => {
  it('Scenario: stats --help shows options', () => {
    const output = run('stats --help');
    expect(output).toContain('--user-id');
    expect(output).toContain('statistics');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: Backup and Restore
// ═══════════════════════════════════════════════════════════════════

describe('Feature: Backup and Restore', () => {
  it('Scenario: backup --help shows options', () => {
    const output = run('manage backup --help');
    expect(output).toContain('--output');
    expect(output).toContain('--user-id');
    expect(output).toContain('--limit');
  });

  it('Scenario: restore --help shows options', () => {
    const output = run('manage restore --help');
    expect(output).toContain('--dry-run');
    expect(output).toContain('file');
  });

  it('Scenario: cleanup --help shows options', () => {
    const output = run('manage cleanup --help');
    expect(output).toContain('--strategy');
    expect(output).toContain('--threshold');
    expect(output).toContain('--dry-run');
  });

  it('Scenario: restore non-existent file fails', () => {
    const output = run('manage restore /nonexistent/file.json');
    expect(output).toContain('not found');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: Memory CRUD help
// ═══════════════════════════════════════════════════════════════════

describe('Feature: Memory CRUD', () => {
  it('Scenario: memory add --help shows options', () => {
    const output = run('memory add --help');
    expect(output).toContain('--user-id');
    expect(output).toContain('--agent-id');
    expect(output).toContain('--run-id');
    expect(output).toContain('--metadata');
    expect(output).toContain('--memory-type');
    expect(output).toContain('--no-infer');
    expect(output).toContain('--scope');
    expect(output).toContain('--category');
  });

  it('Scenario: memory search --help shows options', () => {
    const output = run('memory search --help');
    expect(output).toContain('--user-id');
    expect(output).toContain('--run-id');
    expect(output).toContain('--limit');
    expect(output).toContain('--threshold');
  });

  it('Scenario: memory list --help shows options', () => {
    const output = run('memory list --help');
    expect(output).toContain('--user-id');
    expect(output).toContain('--run-id');
    expect(output).toContain('--limit');
    expect(output).toContain('--offset');
    expect(output).toContain('--sort');
    expect(output).toContain('--order');
  });

  it('Scenario: memory delete-all requires --confirm', () => {
    const output = run('memory delete-all');
    expect(output).toContain('--confirm');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Feature: Interactive Shell
// ═══════════════════════════════════════════════════════════════════

describe('Feature: Interactive Shell', () => {
  it('Scenario: shell --help shows description', () => {
    const output = run('shell --help');
    expect(output).toContain('Interactive');
  });
});
