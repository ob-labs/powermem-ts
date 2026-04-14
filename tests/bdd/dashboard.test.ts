/**
 * BDD-style API tests.
 * Boots an isolated in-process server so results do not depend on an external service.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerApp } from '../../src/server/main.js';
import { MockEmbeddings } from '../mocks.js';

let server: Server;
let baseUrl = '';
let closeApp: (() => Promise<void>) | undefined;
let tmpDir = '';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdd-dashboard-'));
  const appState = await createServerApp({
    dbPath: path.join(tmpDir, 'bdd.db'),
    embeddings: new MockEmbeddings(),
  });
  closeApp = appState.close;
  server = appState.app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closeApp?.();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('BDD: REST API', () => {
  describe('Feature: REST API', () => {
    it('Scenario: Health endpoint returns ok', async () => {
      const res = await fetch(`${baseUrl}/system/health`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ok');
    });

    it('Scenario: Status endpoint returns version and uptime', async () => {
      const res = await fetch(`${baseUrl}/system/status`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.version).toBe('0.1.1');
      expect(json.data.storageType).toBe('sqlite');
      expect(json.data.status).toBe('running');
      expect(typeof json.data.uptime).toBe('number');
    });

    it('Scenario: Stats endpoint returns memory statistics', async () => {
      const res = await fetch(`${baseUrl}/memories/stats`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalMemories).toBeGreaterThanOrEqual(0);
      expect(json.data.ageDistribution).toBeDefined();
    });

    it('Scenario: Memories list endpoint returns array', async () => {
      const res = await fetch(`${baseUrl}/memories?limit=5`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.memories)).toBe(true);
    });

    it('Scenario: Create memory via POST', async () => {
      const res = await fetch(`${baseUrl}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'BDD test memory', user_id: 'bdd-user', infer: false }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.memories.length).toBeGreaterThanOrEqual(1);
    });

    it('Scenario: Search memories via POST', async () => {
      const res = await fetch(`${baseUrl}/memories/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'BDD test', limit: 5 }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.results).toBeDefined();
    });
  });
});
