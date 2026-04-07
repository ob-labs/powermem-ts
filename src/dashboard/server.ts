#!/usr/bin/env node
/**
 * PowerMem Dashboard — Express server with full REST API.
 * Modular architecture matching Python FastAPI edition.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Memory } from '../core/memory.js';
import type { Embeddings } from '@langchain/core/embeddings';
import { VERSION } from '../version.js';
import { loadServerConfig, type ServerConfig } from './config.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createMetricsMiddleware } from './middleware/metrics.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { createSystemRouter } from './routers/system.js';
import { createMemoriesRouter } from './routers/memories.js';
import { createAgentsRouter } from './routers/agents.js';
import { createUsersRouter } from './routers/users.js';
import { buildOpenAPISpec } from './openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DashboardServerOptions {
  port?: number;
  dbPath?: string;
  embeddings?: Embeddings;
  memory?: Memory;
  config?: Partial<ServerConfig>;
}

export async function createDashboardServer(options: DashboardServerOptions = {}) {
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

  // ─── Routers ───────────────────────────────────────────────────────
  app.use('/api/v1/system', createSystemRouter(memory, startTime));
  app.use('/api/v1/memories', createMemoriesRouter(memory));
  app.use('/api/v1/agents', createAgentsRouter(memory));
  app.use('/api/v1/users', createUsersRouter(memory));

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

  // ─── Dashboard HTML ────────────────────────────────────────────────
  const publicDir = path.join(__dirname, 'public');
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use('/dashboard', express.static(publicDir));

  // ─── Root ──────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      name: 'PowerMem TS',
      version: VERSION,
      dashboard: '/dashboard/',
      api: '/api/v1/',
      docs: '/docs',
      openapi: '/openapi.json',
    });
  });

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  return { app, memory };
}

// CLI entry: npx tsx src/dashboard/server.ts
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const config = loadServerConfig();

  let embeddings: Embeddings | undefined;
  try {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
  } catch {
    const { Embeddings: EmbBase } = await import('@langchain/core/embeddings');
    class DemoEmbeddings extends EmbBase {
      async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
      async embedDocuments(docs: string[]) { return docs.map(d => this.embedQuery(d) as any); }
    }
    embeddings = new DemoEmbeddings({});
  }

  createDashboardServer({ dbPath: process.env.DB_PATH, embeddings }).then(({ app }) => {
    app.listen(config.port, config.host, () => {
      console.log(`PowerMem Dashboard running at http://${config.host}:${config.port}/dashboard/`);
      console.log(`API at http://${config.host}:${config.port}/api/v1/`);
      console.log(`Docs at http://${config.host}:${config.port}/docs`);
    });
  });
}
