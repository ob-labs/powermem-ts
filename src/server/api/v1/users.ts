/**
 * User routes — user profile + user-scoped memory operations.
 * Mirrors Python powermem/src/server/routers/users.py.
 */
import { Router } from 'express';
import { APIError, ErrorCode } from '../../models/errors.js';
import {
  parseUserProfileAddRequest,
  parseUserProfileUpdateRequest,
} from '../../models/request.js';
import {
  memoryListToResponse,
  memoryToResponse,
  userProfileToResponse,
} from '../../utils/converters.js';
import {
  createApiResponse,
  requireService,
  sendApiError,
} from '../../utils/http.js';
import type { UserService } from '../../services/user_service.js';

function parseStringArrayQuery(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function createUsersRouter(userService: UserService | null): Router {
  const router = Router();

  // GET /users/profiles — list all user profiles
  router.get('/profiles', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const userId = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;
      const fuzzy = req.query.fuzzy === 'true' || req.query.fuzzy === '1';
      const result = await service.listProfiles({
        userId,
        fuzzy,
        mainTopic: parseStringArrayQuery(req.query.main_topic),
        subTopic: parseStringArrayQuery(req.query.sub_topic),
        topicValue: parseStringArrayQuery(req.query.topic_value),
        limit,
        offset,
      });
      res.json(createApiResponse({
        profiles: result.profiles.map((profile) => userProfileToResponse(profile.userId, profile)),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // GET /users/:userId/profile — get user profile
  router.get('/:userId/profile', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const result = await service.getProfile(req.params.userId);
      res.json(createApiResponse(userProfileToResponse(req.params.userId, result)));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // POST /users/:userId/profile — add messages and extract profile
  router.post('/:userId/profile', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const request = parseUserProfileAddRequest(req.body);
      const result = await service.addProfile(req.params.userId, request.messages, {
        agentId: request.agent_id,
        runId: request.run_id,
        metadata: request.metadata,
        filters: request.filters,
        scope: request.scope,
        memoryType: request.memory_type,
        prompt: request.prompt,
        infer: request.infer,
        profileType: request.profile_type,
        customTopics: request.custom_topics,
        strictMode: request.strict_mode,
        includeRoles: request.include_roles,
        excludeRoles: request.exclude_roles,
        nativeLanguage: request.native_language,
      });
      const {
        memories,
        profileExtracted,
        profileContent,
        topics,
        ...rest
      } = result as Record<string, unknown> & {
        memories?: unknown[];
        profileExtracted?: boolean;
        profileContent?: string;
        topics?: Record<string, unknown>;
      };
      res.json(createApiResponse({
        ...rest,
        ...(Array.isArray(memories) ? { memories: memories.map((item) => memoryToResponse(item as Parameters<typeof memoryToResponse>[0])) } : {}),
        ...(profileExtracted !== undefined ? { profile_extracted: profileExtracted } : {}),
        ...(profileContent !== undefined ? { profile_content: profileContent } : {}),
        ...(topics !== undefined ? { topics } : {}),
      }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // DELETE /users/:userId/profile — delete user profile data
  router.delete('/:userId/profile', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const result = await service.deleteProfile(req.params.userId);
      res.json(createApiResponse({
        user_id: result.userId,
        deleted: result.deleted,
      }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // GET /users/:userId/memories — list user memories
  router.get('/:userId/memories', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await service.listMemories(req.params.userId, limit, offset);
      res.json(createApiResponse(
        memoryListToResponse(result.memories, result.total, result.limit, result.offset),
      ));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // PUT /users/:userId/memories/:memoryId — update user memory
  router.put('/:userId/memories/:memoryId', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const request = parseUserProfileUpdateRequest(req.body);
      const result = await service.updateMemory(
        req.params.userId,
        req.params.memoryId,
        request.content,
        request.agent_id,
        request.metadata,
      );
      if (!result) {
        throw new APIError(
          ErrorCode.MEMORY_NOT_FOUND,
          `Memory ${req.params.memoryId} not found`,
          { memory_id: req.params.memoryId, user_id: req.params.userId },
          404,
        );
      }
      res.json(createApiResponse(memoryToResponse(result)));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  // DELETE /users/:userId/memories — delete all user memories
  router.delete('/:userId/memories', async (req, res) => {
    try {
      const service = requireService(userService, 'UserService');
      const result = await service.deleteMemories(req.params.userId);
      res.json(createApiResponse({
        user_id: result.userId,
        deleted_count: result.deleted_count,
        failed_count: result.failed_count,
        total: result.total,
      }));
    } catch (err) {
      sendApiError(res, err);
    }
  });

  return router;
}
