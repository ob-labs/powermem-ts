/**
 * Agent routes — agent-scoped memory operations.
 * Mirrors Python powermem/src/server/routers/agents.py.
 */
import { Router } from 'express';
import type { Memory } from '../../core/memory.js';

export function createAgentsRouter(memory: Memory): Router {
  const router = Router();

  // GET /agents/:agentId/memories — list agent memories
  router.get('/:agentId/memories', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await memory.getAll({
        agentId: req.params.agentId,
        limit, offset,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // POST /agents/:agentId/memories — add memory for agent
  router.post('/:agentId/memories', async (req, res) => {
    try {
      const { content, user_id, infer, metadata } = req.body;
      const result = await memory.add(content, {
        agentId: req.params.agentId,
        userId: user_id,
        infer: infer ?? false,
        metadata,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // GET /agents/:agentId/memories/share — get shared memories
  router.get('/:agentId/memories/share', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      // Shared memories = memories accessible by this agent with scope metadata
      const result = await memory.getAll({
        agentId: req.params.agentId,
        limit,
      });
      // Filter to shared scope
      const shared = result.memories.filter(m =>
        m.metadata && (m.metadata as Record<string, unknown>).scope === 'shared'
      );
      res.json({ success: true, data: { memories: shared, total: shared.length } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // POST /agents/:agentId/memories/share — share memories between agents
  router.post('/:agentId/memories/share', async (req, res) => {
    try {
      const { memory_ids, target_agent_id } = req.body as { memory_ids: string[]; target_agent_id: string };
      let shared = 0;
      for (const memId of memory_ids) {
        const existing = await memory.get(memId);
        if (existing) {
          // Create a copy for the target agent with shared scope
          await memory.add(existing.content, {
            agentId: target_agent_id,
            metadata: { ...existing.metadata, scope: 'shared', sharedFrom: req.params.agentId },
            infer: false,
          });
          shared++;
        }
      }
      res.json({ success: true, data: { shared_count: shared } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
