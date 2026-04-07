#!/usr/bin/env node
/**
 * PowerMem API server — Express server with full REST API.
 * Modular architecture matching Python FastAPI edition.
 */
import express from 'express';
import { Memory } from '../powermem/core/memory.js';
import type { Embeddings } from '@langchain/core/embeddings';
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
  memory?: Memory;
  config?: Partial<ServerConfig>;
}

export interface ServerServices {
  memoryService: MemoryService;
  searchService: SearchService;
  userService: UserService;
  agentService: AgentService;
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

  // ─── Memory instance ──────────────────────────────────────────────
  const memory = options.memory ?? await Memory.create({
    dbPath: options.dbPath ?? ':memory:',
    embeddings: options.embeddings,
  });
  const startTime = Date.now();
  const services: ServerServices = {
    memoryService: new MemoryService(memory),
    searchService: new SearchService(memory),
    userService: new UserService(memory),
    agentService: new AgentService(memory),
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

  return { app, memory, services };
}
