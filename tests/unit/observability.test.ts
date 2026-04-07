import { describe, it, expect, afterEach } from 'vitest';
import { TelemetryCollector } from '../../src/observability/telemetry.js';
import { AuditLogger } from '../../src/observability/audit.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('TelemetryCollector', () => {
  it('noop when disabled', async () => {
    const t = new TelemetryCollector({ enableTelemetry: false });
    t.track('test.event', { key: 'value' });
    expect(t.pendingCount).toBe(0);
  });

  it('tracks events when enabled', () => {
    const t = new TelemetryCollector({ enableTelemetry: true });
    t.track('memory.add', { userId: 'u1' });
    t.track('memory.search', { query: 'test' });
    expect(t.pendingCount).toBe(2);
  });

  it('flush returns and clears events', async () => {
    const t = new TelemetryCollector({ enableTelemetry: true });
    t.track('a');
    t.track('b');
    t.track('c');
    const flushed = await t.flush();
    expect(flushed).toHaveLength(3);
    expect(flushed[0].name).toBe('a');
    expect(flushed[0].timestamp).toBeTruthy();
    expect(t.pendingCount).toBe(0);
  });

  it('events include timestamp and properties', () => {
    const t = new TelemetryCollector({ enableTelemetry: true });
    t.track('test', { foo: 'bar' });
    expect(t.pendingCount).toBe(1);
  });
});

describe('AuditLogger', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  const logFile = path.join(tmpDir, 'audit.log');

  afterEach(() => {
    try { fs.unlinkSync(logFile); } catch { /* ok */ }
  });

  it('noop when disabled', () => {
    const a = new AuditLogger({ enabled: false, logFile });
    a.log('ADD', { id: '1' });
    a.close();
    expect(fs.existsSync(logFile)).toBe(false);
  });

  it('writes JSON lines when enabled', () => {
    const a = new AuditLogger({ enabled: true, logFile, logLevel: 'INFO' });
    a.log('ADD', { memoryId: '001' });
    a.log('DELETE', { memoryId: '002' });
    a.close();

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const entry = JSON.parse(lines[0]);
    expect(entry.action).toBe('ADD');
    expect(entry.timestamp).toBeTruthy();
    expect(entry.details.memoryId).toBe('001');
  });

  it('respects log level filtering', () => {
    const a = new AuditLogger({ enabled: true, logFile, logLevel: 'WARNING' });
    a.log('INFO_EVENT', {}, 'INFO');
    a.log('WARN_EVENT', {}, 'WARNING');
    a.log('ERROR_EVENT', {}, 'ERROR');
    a.close();

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2); // WARNING + ERROR only
  });

  it('creates directory if not exists', () => {
    const nested = path.join(tmpDir, 'nested', 'dir', 'audit.log');
    const a = new AuditLogger({ enabled: true, logFile: nested });
    a.log('TEST', {});
    a.close();
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.join(tmpDir, 'nested'), { recursive: true });
  });
});
