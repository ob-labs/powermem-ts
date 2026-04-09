import { Router } from 'express';
import type { SearchService } from '../../services/search_service.js';
import { APIError, ErrorCode } from '../../models/errors.js';
import { createApiResponse, requireService, sendApiError } from '../../utils/http.js';

export function createSearchRouter(searchService: SearchService | null): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    try {
      const service = requireService(searchService, 'SearchService');
      const query = req.query.query as string ?? req.query.q as string;
      if (!query) {
        throw new APIError(ErrorCode.INVALID_REQUEST, 'query parameter is required', {}, 400);
      }
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const runId = req.query.run_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 30;
      const result = await service.search(query, { userId, agentId, runId, limit });
      res.json(createApiResponse(result, 'Search completed successfully'));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  router.post('/search', async (req, res) => {
    try {
      const service = requireService(searchService, 'SearchService');
      const { query, user_id, agent_id, run_id, limit, threshold } = req.body;
      const result = await service.search(query, {
        userId: user_id,
        agentId: agent_id,
        runId: run_id,
        limit,
        threshold,
      });
      res.json(createApiResponse(result, 'Search completed successfully'));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  return router;
}
