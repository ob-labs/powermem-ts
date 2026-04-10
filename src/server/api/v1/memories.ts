/**
 * Memory CRUD routes — full REST API for memory operations.
 * Mirrors Python powermem/src/server/routers/memories.py.
 */
import { Router } from 'express';
import { calculateStatsFromMemories } from '../../../powermem/utils/stats.js';
import { getMetricsCollector } from '../../middleware/metrics.js';
import type { MemoryService } from '../../services/memory_service.js';
import { createApiResponse, requireService, sendApiError } from '../../utils/http.js';

export function createMemoriesRouter(memoryService: MemoryService | null): Router {
  const router = Router();
  const metrics = getMetricsCollector();

  // ─── Stats & meta (before :id wildcard) ──────────────────

  router.get('/stats', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const all = await service.getAll({ userId, agentId, limit: 10000 });
      const stats = calculateStatsFromMemories(
        all.memories as unknown as Array<Record<string, unknown>>
      );
      res.json(createApiResponse(stats));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  router.get('/count', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const count = await service.count({ userId, agentId });
      res.json(createApiResponse({ count }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  router.get('/users', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const limit = parseInt(req.query.limit as string) || 1000;
      const users = await service.getUsers(limit);
      res.json(createApiResponse({ users }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  router.get('/export', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10000;
      const memories = await service.exportMemories({ userId, agentId, limit });
      res.json(createApiResponse({ memories, count: memories.length }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // ─── List ──────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = req.query.sort_by as string | undefined;
      const order = req.query.order as 'asc' | 'desc' | undefined;
      const result = await service.getAll({ userId, agentId, limit, offset, sortBy, order });
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // ─── Create (batch must come before single POST) ──────────

  router.post('/batch', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { memories: items, user_id, agent_id, run_id, infer } = req.body;
      const result = await service.addBatch(
        items.map((m: { content: string; metadata?: Record<string, unknown>; scope?: string; category?: string }) => ({
          content: m.content, metadata: m.metadata, scope: m.scope, category: m.category,
        })),
        { userId: user_id, agentId: agent_id, runId: run_id, infer: infer ?? false },
      );
      metrics.recordOperation('batch_add', 'success');
      res.json(createApiResponse(result));
    } catch (err) {
      metrics.recordOperation('batch_add', 'error');
      sendApiError(res, err);
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { memories: items, infer } = req.body;
      const result = await service.importMemories(items, { infer: infer ?? false });
      metrics.recordOperation('import', 'success');
      res.json(createApiResponse(result));
    } catch (err) {
      metrics.recordOperation('import', 'error');
      sendApiError(res, err);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { content, user_id, agent_id, run_id, infer, metadata } = req.body;
      const result = await service.add(content, {
        userId: user_id, agentId: agent_id, runId: run_id,
        infer: infer ?? false, metadata,
      });
      metrics.recordOperation('add', 'success');
      res.json(createApiResponse(result));
    } catch (err) {
      metrics.recordOperation('add', 'error');
      sendApiError(res, err);
    }
  });

  // ─── Batch update/delete ──────────────────────────────────

  router.put('/batch', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { updates } = req.body as { updates: Array<{ id: string; content?: string; metadata?: Record<string, unknown> }> };
      const results = [];
      for (const u of updates) {
        const result = await service.update(u.id, u.content ?? '', { metadata: u.metadata });
        results.push(result);
      }
      metrics.recordOperation('batch_update', 'success');
      res.json(createApiResponse({ updated: results.length, memories: results }));
    } catch (err) {
      metrics.recordOperation('batch_update', 'error');
      sendApiError(res, err);
    }
  });

  router.delete('/batch', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { ids } = req.body as { ids: string[] };
      let deleted = 0;
      for (const id of ids) {
        if (await service.delete(id)) deleted++;
      }
      metrics.recordOperation('batch_delete', 'success');
      res.json(createApiResponse({ deleted }));
    } catch (err) {
      metrics.recordOperation('batch_delete', 'error');
      sendApiError(res, err);
    }
  });

  // ─── Single memory by ID ──────────────────────────────────

  router.get('/:id', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const result = await service.get(req.params.id);
      if (!result) {
        res.status(404).json({ success: false, message: 'Memory not found' });
        return;
      }
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const { content, metadata } = req.body;
      const result = await service.update(req.params.id, content, { metadata });
      metrics.recordOperation('update', 'success');
      res.json(createApiResponse(result));
    } catch (err) {
      metrics.recordOperation('update', 'error');
      sendApiError(res, err);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const ok = await service.delete(req.params.id);
      metrics.recordOperation('delete', 'success');
      res.json(createApiResponse({ deleted: ok }));
    } catch (err) {
      metrics.recordOperation('delete', 'error');
      sendApiError(res, err);
    }
  });

  // ─── Delete all (no :id) ──────────────────────────────────

  router.delete('/', async (req, res) => {
    try {
      const service = requireService(memoryService, 'MemoryService');
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      await service.deleteAll({ userId, agentId });
      metrics.recordOperation('delete_all', 'success');
      res.json(createApiResponse({ deleted: true }));
    } catch (err) {
      metrics.recordOperation('delete_all', 'error');
      sendApiError(res, err);
    }
  });

  return router;
}
