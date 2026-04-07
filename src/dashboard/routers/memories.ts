/**
 * Memory CRUD routes — full REST API for memory operations.
 * Mirrors Python powermem/src/server/routers/memories.py.
 */
import { Router } from 'express';
import type { Memory } from '../../core/memory.js';
import { calculateStatsFromMemories } from '../../utils/stats.js';
import { getMetricsCollector } from '../middleware/metrics.js';

export function createMemoriesRouter(memory: Memory): Router {
  const router = Router();
  const metrics = getMetricsCollector();

  // ─── Stats & meta (before :id wildcard) ──────────────────

  router.get('/stats', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const all = await memory.getAll({ userId, agentId, limit: 10000 });
      const stats = calculateStatsFromMemories(
        all.memories as unknown as Array<Record<string, unknown>>
      );
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.get('/count', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const count = await memory.count({ userId, agentId });
      res.json({ success: true, data: { count } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.get('/users', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 1000;
      const users = await memory.getUsers(limit);
      res.json({ success: true, data: { users } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.get('/export', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10000;
      const memories = await memory.exportMemories({ userId, agentId, limit });
      res.json({ success: true, data: { memories, count: memories.length } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // GET search via query params (in addition to POST below)
  router.get('/search', async (req, res) => {
    try {
      const query = req.query.query as string ?? req.query.q as string;
      if (!query) {
        res.status(400).json({ success: false, message: 'query parameter is required' });
        return;
      }
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await memory.search(query, { userId, agentId, limit });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // ─── List ──────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = req.query.sort_by as string | undefined;
      const order = req.query.order as 'asc' | 'desc' | undefined;
      const result = await memory.getAll({ userId, agentId, limit, offset, sortBy, order });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // ─── Create (batch must come before single POST) ──────────

  router.post('/batch', async (req, res) => {
    try {
      const { memories: items, user_id, agent_id, run_id, infer } = req.body;
      const result = await memory.addBatch(
        items.map((m: { content: string; metadata?: Record<string, unknown>; scope?: string; category?: string }) => ({
          content: m.content, metadata: m.metadata, scope: m.scope, category: m.category,
        })),
        { userId: user_id, agentId: agent_id, runId: run_id, infer: infer ?? false },
      );
      metrics.recordOperation('batch_add', 'success');
      res.json({ success: true, data: result });
    } catch (err) {
      metrics.recordOperation('batch_add', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.post('/search', async (req, res) => {
    try {
      const { query, user_id, agent_id, limit } = req.body;
      const result = await memory.search(query, {
        userId: user_id, agentId: agent_id, limit,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const { memories: items, infer } = req.body;
      const result = await memory.importMemories(items, { infer: infer ?? false });
      metrics.recordOperation('import', 'success');
      res.json({ success: true, data: result });
    } catch (err) {
      metrics.recordOperation('import', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { content, user_id, agent_id, run_id, infer, metadata } = req.body;
      const result = await memory.add(content, {
        userId: user_id, agentId: agent_id, runId: run_id,
        infer: infer ?? false, metadata,
      });
      metrics.recordOperation('add', 'success');
      res.json({ success: true, data: result });
    } catch (err) {
      metrics.recordOperation('add', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // ─── Batch update/delete ──────────────────────────────────

  router.put('/batch', async (req, res) => {
    try {
      const { updates } = req.body as { updates: Array<{ id: string; content?: string; metadata?: Record<string, unknown> }> };
      const results = [];
      for (const u of updates) {
        const result = await memory.update(u.id, u.content ?? '', { metadata: u.metadata });
        results.push(result);
      }
      metrics.recordOperation('batch_update', 'success');
      res.json({ success: true, data: { updated: results.length, memories: results } });
    } catch (err) {
      metrics.recordOperation('batch_update', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.delete('/batch', async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      let deleted = 0;
      for (const id of ids) {
        if (await memory.delete(id)) deleted++;
      }
      metrics.recordOperation('batch_delete', 'success');
      res.json({ success: true, data: { deleted } });
    } catch (err) {
      metrics.recordOperation('batch_delete', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // ─── Single memory by ID ──────────────────────────────────

  router.get('/:id', async (req, res) => {
    try {
      const result = await memory.get(req.params.id);
      if (!result) {
        res.status(404).json({ success: false, message: 'Memory not found' });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { content, metadata } = req.body;
      const result = await memory.update(req.params.id, content, { metadata });
      metrics.recordOperation('update', 'success');
      res.json({ success: true, data: result });
    } catch (err) {
      metrics.recordOperation('update', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const ok = await memory.delete(req.params.id);
      metrics.recordOperation('delete', 'success');
      res.json({ success: true, data: { deleted: ok } });
    } catch (err) {
      metrics.recordOperation('delete', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // ─── Delete all (no :id) ──────────────────────────────────

  router.delete('/', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      await memory.deleteAll({ userId, agentId });
      metrics.recordOperation('delete_all', 'success');
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      metrics.recordOperation('delete_all', 'error');
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
