#!/usr/bin/env node
/**
 * PowerMem API server — Express server with full REST API.
 * Modular architecture matching Python FastAPI edition.
 */
import express from 'express';
import { Memory } from '../powermem/core/memory.js';
import { UserMemory } from '../powermem/user_memory/user_memory.js';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MemoryConfigInput } from '../powermem/configs.js';
import type { MemoryOptions } from '../powermem/types/options.js';
import { VERSION } from '../powermem/version.js';
import { loadServerConfig, type ServerConfig } from './config.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createMetricsMiddleware } from './middleware/metrics.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { createApiRouter } from './api/v1/index.js';
import { MemoryService } from './services/memory_service.js';
import { SearchService } from './services/search_service.js';
import { UserService } from './services/user_service.js';
import { AgentService } from './services/agent_service.js';
import { buildOpenAPISpec } from './openapi.js';

export interface ServerAppOptions {
  port?: number;
  dbPath?: string;
  embeddings?: Embeddings;
  llm?: BaseChatModel;
  memory?: Memory;
  userMemory?: UserMemory;
  memoryConfig?: MemoryConfigInput;
  config?: Partial<ServerConfig>;
}

export interface ServerServices {
  memoryService: MemoryService | null;
  searchService: SearchService | null;
  userService: UserService | null;
  agentService: AgentService | null;
}

function buildSharedMemoryOptions(options: ServerAppOptions): MemoryOptions {
  return {
    ...(options.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
    ...(options.embeddings ? { embeddings: options.embeddings } : {}),
    ...(options.llm ? { llm: options.llm } : {}),
    ...(options.memoryConfig ? { config: options.memoryConfig } : {}),
  };
}

export async function createServerApp(options: ServerAppOptions = {}) {
  const app = express();
  const config = { ...loadServerConfig(), ...options.config };

  app.use(express.json({ limit: '10mb' }));

  // ─── CORS ──────────────────────────────────────────────────────────
  if (config.corsEnabled) {
    app.use((_req, res, next) => {
      res.set('Access-Control-Allow-Origin', config.corsOrigins);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  // ─── Middleware ─────────────────────────────────────────────────────
  app.use(createLoggingMiddleware());
  app.use(createMetricsMiddleware());
  app.use(createAuthMiddleware(config));
  app.use(createRateLimitMiddleware(config));

  const memoryOptions = buildSharedMemoryOptions(options);
  const initializeService = async <T>(factory: () => Promise<T>, serviceName: string): Promise<T | null> => {
    try {
      return await factory();
    } catch (error) {
      console.error(`${serviceName} initialization failed`, error);
      return null;
    }
  };

  const userService = await initializeService(
    () => UserService.create({
      userMemory: options.userMemory,
      memory: options.memory,
      memoryOptions,
      config: options.memoryConfig,
    }),
    'UserService',
  );
  const memoryService = await initializeService(
    () => MemoryService.create({
      memory: options.memory,
      memoryOptions,
      config: options.memoryConfig,
    }),
    'MemoryService',
  );
  const searchService = await initializeService(
    () => SearchService.create({
      memory: options.memory,
      memoryOptions,
      config: options.memoryConfig,
    }),
    'SearchService',
  );
  const agentService = await initializeService(
    () => AgentService.create({
      memory: options.memory,
      memoryOptions,
      config: options.memoryConfig,
    }),
    'AgentService',
  );

  const memory = memoryService?.getMemory();
  const userMemory = userService?.getUserMemory();
  const startTime = Date.now();
  const services: ServerServices = {
    memoryService,
    searchService,
    userService,
    agentService,
  };

  // ─── Routers ───────────────────────────────────────────────────────
  app.use('/api/v1', createApiRouter(services, startTime));

  // ─── OpenAPI / Docs ────────────────────────────────────────────────
  app.get('/openapi.json', (_req, res) => {
    res.json(buildOpenAPISpec(VERSION));
  });

  app.get('/docs', (_req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>PowerMem API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })</script>
</body></html>`);
  });

  // ─── Root ──────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      name: 'PowerMem TS',
      version: VERSION,
      api: '/api/v1/',
      docs: '/docs',
      openapi: '/openapi.json',
    });
  });

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  const close = async () => {
    const closers: Array<Promise<void>> = [];

    if (!options.memory) {
      if (services.agentService) closers.push(services.agentService.close());
      if (services.searchService) closers.push(services.searchService.close());
      if (services.memoryService) closers.push(services.memoryService.close());
    }

    if (!options.userMemory && !options.memory) {
      if (services.userService) closers.push(services.userService.close());
    }

    await Promise.allSettled(closers);
  };

  return { app, memory, userMemory, services, close };
}
