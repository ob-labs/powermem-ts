import { Router } from 'express';
import type { SearchService } from '../../services/search_service.js';

export function createSearchRouter(searchService: SearchService): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    try {
      const query = req.query.query as string ?? req.query.q as string;
      if (!query) {
        res.status(400).json({ success: false, message: 'query parameter is required' });
        return;
      }
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const runId = req.query.run_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 30;
      const result = await searchService.search(query, { userId, agentId, runId, limit });
      res.json({ success: true, data: result, message: 'Search completed successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  router.post('/search', async (req, res) => {
    try {
      const { query, user_id, agent_id, run_id, limit, threshold } = req.body;
      const result = await searchService.search(query, {
        userId: user_id,
        agentId: agent_id,
        runId: run_id,
        limit,
        threshold,
      });
      res.json({ success: true, data: result, message: 'Search completed successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
