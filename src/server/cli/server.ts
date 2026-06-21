import { createServerApp } from '../main.js';
import { loadServerConfig } from '../config.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { isEmbeddedStorage } from './embedded-storage.js';
import { createEmbeddings } from '../../powermem/integrations/embeddings/factory.js';
import type { Embeddings } from '@langchain/core/embeddings';

const config = loadServerConfig();
const memoryConfig = autoConfig();

if (!config.reload && config.workers !== 1 && isEmbeddedStorage(memoryConfig)) {
  console.error(
    `[server] Embedded storage detected (SQLite or SeekDB without host). Forcing workers=1 (was ${config.workers}).`,
  );
  config.workers = 1;
}

let embeddings: Embeddings | undefined;
const embedderConf = memoryConfig.embedder;
if (embedderConf?.provider && embedderConf.config) {
  try {
    embeddings = await createEmbeddings({
      provider: embedderConf.provider,
      ...(embedderConf.config as Record<string, unknown>),
    } as Parameters<typeof createEmbeddings>[0]);
    console.log(`[server] Using configured embeddings: ${embedderConf.provider}/${(embedderConf.config as Record<string, unknown>).model ?? 'default'}`);
  } catch (err) {
    console.error(`[server] Failed to create embeddings from config (${embedderConf.provider}):`, err);
  }
}

if (!embeddings) {
  try {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
    console.log('[server] Fallback: using Ollama embeddings');
  } catch {
    const { Embeddings: EmbBase } = await import('@langchain/core/embeddings');
    class DemoEmbeddings extends EmbBase {
      async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
      async embedDocuments(docs: string[]) { return docs.map((doc) => this.embedQuery(doc) as never); }
    }
    embeddings = new DemoEmbeddings({});
    console.log('[server] Fallback: using DemoEmbeddings (8-dim)');
  }
}

const { app } = await createServerApp({
  dbPath: process.env.DB_PATH,
  embeddings,
  memoryConfig,
  config,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`PowerMem API server running at http://${config.host}:${config.port}/`);
  console.log(`API at http://${config.host}:${config.port}/api/v1/`);
  console.log(`Docs at http://${config.host}:${config.port}/docs`);
});

process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down…');
  server.close();
});
process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down…');
  server.close();
});
