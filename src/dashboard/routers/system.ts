/**
 * System routes — health, status, metrics, admin operations.
 * Mirrors Python powermem/src/server/routers/ system endpoints.
 */
import { Router } from 'express';
import type { Memory } from '../../core/memory.js';
import { VERSION } from '../../version.js';
import { getMetricsCollector } from '../middleware/metrics.js';

export function createSystemRouter(memory: Memory, startTime: number): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  router.get('/status', (_req, res) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.json({
      success: true,
      data: {
        version: VERSION,
        storageType: 'sqlite',
        uptime,
        status: 'running',
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
      },
    });
  });

  router.get('/metrics', (_req, res) => {
    const collector = getMetricsCollector();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(collector.toPrometheus());
  });

  router.delete('/delete-all-memories', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      await memory.deleteAll({ userId, agentId });
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
