/**
 * Agent routes — agent-scoped memory operations.
 * Mirrors Python powermem/src/server/routers/agents.py.
 */
import { Router } from 'express';
import type { AgentService } from '../../services/agent_service.js';
import { createApiResponse, requireService, sendApiError } from '../../utils/http.js';

export function createAgentsRouter(agentService: AgentService | null): Router {
  const router = Router();

  // GET /agents/:agentId/memories — list agent memories
  router.get('/:agentId/memories', async (req, res) => {
    try {
      const service = requireService(agentService, 'AgentService');
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await service.listMemories(req.params.agentId, limit, offset);
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // POST /agents/:agentId/memories — add memory for agent
  router.post('/:agentId/memories', async (req, res) => {
    try {
      const service = requireService(agentService, 'AgentService');
      const { content, user_id, infer, metadata } = req.body;
      const result = await service.addMemory(req.params.agentId, content, {
        userId: user_id,
        infer: infer ?? false,
        metadata,
      });
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // GET /agents/:agentId/memories/share — get shared memories
  router.get('/:agentId/memories/share', async (req, res) => {
    try {
      const service = requireService(agentService, 'AgentService');
      const limit = parseInt(req.query.limit as string) || 100;
      const result = await service.listSharedMemories(req.params.agentId, limit);
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // POST /agents/:agentId/memories/share — share memories between agents
  router.post('/:agentId/memories/share', async (req, res) => {
    try {
      const service = requireService(agentService, 'AgentService');
      const { memory_ids, target_agent_id } = req.body as { memory_ids: string[]; target_agent_id: string };
      const result = await service.shareMemories(req.params.agentId, memory_ids, target_agent_id);
      res.json(createApiResponse(result));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  return router;
}
