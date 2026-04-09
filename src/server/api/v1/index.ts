import { Router } from 'express';
import { createSearchRouter } from './search.js';
import { createMemoriesRouter } from './memories.js';
import { createUsersRouter } from './users.js';
import { createAgentsRouter } from './agents.js';
import { createSystemRouter } from './system.js';
import type { MemoryService } from '../../services/memory_service.js';
import type { SearchService } from '../../services/search_service.js';
import type { UserService } from '../../services/user_service.js';
import type { AgentService } from '../../services/agent_service.js';

export interface ApiServices {
  memoryService: MemoryService | null;
  searchService: SearchService | null;
  userService: UserService | null;
  agentService: AgentService | null;
}

export function createApiRouter(services: ApiServices, startTime: number): Router {
  const router = Router();
  router.use('/memories', createSearchRouter(services.searchService));
  router.use('/memories', createMemoriesRouter(services.memoryService));
  router.use('/users', createUsersRouter(services.userService));
  router.use('/agents', createAgentsRouter(services.agentService));
  router.use('/system', createSystemRouter(services.memoryService, startTime));
  return router;
}
