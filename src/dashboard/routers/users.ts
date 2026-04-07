/**
 * User routes — user profile + user-scoped memory operations.
 * Mirrors Python powermem/src/server/routers/users.py.
 */
import { Router } from 'express';
import type { Memory } from '../../core/memory.js';

export function createUsersRouter(memory: Memory): Router {
  const router = Router();

  // GET /users/profiles — list all user profiles (via getUsers)
  router.get('/profiles', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const users = await memory.getUsers(limit);
      // Build minimal profile objects for each user
      const profiles = await Promise.all(users.map(async (userId) => {
        const count = await memory.count({ userId });
        return { userId, memoryCount: count };
      }));
      res.json({ success: true, data: { profiles, total: profiles.length } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // GET /users/:userId/profile — get user profile
  router.get('/:userId/profile', async (req, res) => {
    try {
      const userId = req.params.userId;
      const count = await memory.count({ userId });
      const stats = await memory.getStatistics({ userId });
      res.json({ success: true, data: { userId, memoryCount: count, ...stats } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // POST /users/:userId/profile — add messages and extract profile
  router.post('/:userId/profile', async (req, res) => {
    try {
      const { content, metadata, infer } = req.body;
      const result = await memory.add(content, {
        userId: req.params.userId,
        metadata: { ...metadata, profileExtraction: true },
        infer: infer ?? true,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // DELETE /users/:userId/profile — delete user profile data
  router.delete('/:userId/profile', async (req, res) => {
    try {
      await memory.deleteAll({ userId: req.params.userId });
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // GET /users/:userId/memories — list user memories
  router.get('/:userId/memories', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await memory.getAll({
        userId: req.params.userId,
        limit, offset,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // PUT /users/:userId/memories/:memoryId — update user memory
  router.put('/:userId/memories/:memoryId', async (req, res) => {
    try {
      const { content, metadata } = req.body;
      const result = await memory.update(req.params.memoryId, content, { metadata });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  // DELETE /users/:userId/memories — delete all user memories
  router.delete('/:userId/memories', async (req, res) => {
    try {
      await memory.deleteAll({ userId: req.params.userId });
      const count = 0; // Already deleted
      res.json({ success: true, data: { deleted_count: count, deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  return router;
}
