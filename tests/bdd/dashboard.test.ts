/**
 * BDD-style API tests.
 * Boots an isolated in-process server so results do not depend on an external service.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerApp } from '../../src/server/main.js';
import type { Memory } from '../../src/powermem/core/memory.js';
import { MockEmbeddings } from '../mocks.js';

let server: Server;
let memory: Memory;
let baseUrl = '';

beforeAll(async () => {
  const appState = await createServerApp({
    dbPath: ':memory:',
    embeddings: new MockEmbeddings(),
  });
  memory = appState.memory;
  server = appState.app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await memory.close();
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
      expect(json.data.version).toBe('0.3.0');
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
