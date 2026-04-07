/**
 * Agent routes — agent-scoped memory operations.
 * Mirrors Python powermem/src/server/routers/agents.py.
 */
import { Router } from 'express';
import type { AgentService } from '../../services/agent_service.js';

export function createAgentsRouter(agentService: AgentService): Router {
  const router = Router();

  // GET /agents/:agentId/memories — list agent memories
  router.get('/:agentId/memories', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await agentService.listMemories(req.params.agentId, limit, offset);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // POST /agents/:agentId/memories — add memory for agent
  router.post('/:agentId/memories', async (req, res) => {
    try {
      const { content, user_id, infer, metadata } = req.body;
      const result = await agentService.addMemory(req.params.agentId, content, {
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
      const result = await agentService.listSharedMemories(req.params.agentId, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // POST /agents/:agentId/memories/share — share memories between agents
  router.post('/:agentId/memories/share', async (req, res) => {
    try {
      const { memory_ids, target_agent_id } = req.body as { memory_ids: string[]; target_agent_id: string };
      const result = await agentService.shareMemories(req.params.agentId, memory_ids, target_agent_id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
