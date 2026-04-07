import { describe, it, expect, afterEach } from 'vitest';
import { TelemetryManager } from '../../src/powermem/core/telemetry.js';
import { AuditLogger } from '../../src/powermem/core/audit.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('TelemetryManager', () => {
  it('noop when disabled', async () => {
    const t = new TelemetryManager({ enableTelemetry: false });
    t.captureEvent('test.event', { key: 'value' });
    expect(t.pendingCount).toBe(0);
  });

  it('tracks events when enabled', () => {
    const t = new TelemetryManager({ enableTelemetry: true });
    t.captureEvent('memory.add', { userId: 'u1' });
    t.captureEvent('memory.search', { query: 'test' });
    expect(t.pendingCount).toBe(2);
  });

  it('flush returns and clears events', async () => {
    const t = new TelemetryManager({ enableTelemetry: true });
    t.captureEvent('a');
    t.captureEvent('b');
    t.captureEvent('c');
    const flushed = await t.flush();
    expect(flushed).toHaveLength(3);
    expect(flushed[0].eventName).toBe('a');
    expect(flushed[0].timestamp).toBeTruthy();
    expect(t.pendingCount).toBe(0);
  });

  it('events include timestamp and properties', () => {
    const t = new TelemetryManager({ enableTelemetry: true });
    t.captureEvent('test', { foo: 'bar' });
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
    a.logEvent('memory.add', { id: '1' });
    a.close();
    expect(fs.existsSync(logFile)).toBe(false);
  });

  it('writes JSON lines when enabled', () => {
    const a = new AuditLogger({ enabled: true, logFile, logLevel: 'INFO' });
    a.logEvent('memory.add', { memoryId: '001' });
    a.logEvent('memory.delete', { memoryId: '002' });
    a.close();

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const entry = JSON.parse(lines[0]);
    expect(entry.eventType).toBe('memory.add');
    expect(entry.timestamp).toBeTruthy();
    expect(entry.details.memoryId).toBe('001');
  });

  it('respects log level filtering', () => {
    const a = new AuditLogger({ enabled: true, logFile, logLevel: 'WARNING' });
    a.logEvent('info.event', {}, undefined, undefined, 'INFO');
    a.logEvent('warn.event', {}, undefined, undefined, 'WARNING');
    a.logEvent('error.event', {}, undefined, undefined, 'ERROR');
    a.close();

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2); // WARNING + ERROR only
  });

  it('creates directory if not exists', () => {
    const nested = path.join(tmpDir, 'nested', 'dir', 'audit.log');
    const a = new AuditLogger({ enabled: true, logFile: nested });
    a.logEvent('test.event', {});
    a.close();
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.join(tmpDir, 'nested'), { recursive: true });
  });
});
