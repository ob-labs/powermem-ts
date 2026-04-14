import type { Embeddings } from '@langchain/core/embeddings';
import { createServerApp } from '../main.js';
import { loadServerConfig } from '../config.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { isEmbeddedStorage } from './embedded-storage.js';

const config = loadServerConfig();
const memoryConfig = autoConfig();

if (!config.reload && config.workers !== 1 && isEmbeddedStorage(memoryConfig)) {
  console.error(
    `[server] Embedded storage detected (SQLite or SeekDB without host). Forcing workers=1 (was ${config.workers}).`,
  );
  config.workers = 1;
}

let embeddings: Embeddings | undefined;
try {
  const { OllamaEmbeddings } = await import('@langchain/ollama');
  embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
} catch {
  const { Embeddings: EmbBase } = await import('@langchain/core/embeddings');
  class DemoEmbeddings extends EmbBase {
    async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
    async embedDocuments(docs: string[]) { return docs.map((doc) => this.embedQuery(doc) as never); }
  }
  embeddings = new DemoEmbeddings({});
}

createServerApp({
  dbPath: process.env.DB_PATH,
  embeddings,
  memoryConfig,
  config,
}).then(({ app }) => {
  app.listen(config.port, config.host, () => {
    console.log(`PowerMem API server running at http://${config.host}:${config.port}/`);
    console.log(`API at http://${config.host}:${config.port}/api/v1/`);
    console.log(`Docs at http://${config.host}:${config.port}/docs`);
  });
});
