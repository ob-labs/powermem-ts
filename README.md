# PowerMem TypeScript SDK

**Pure TypeScript memory system for AI agents — a full port of [PowerMem](https://github.com/oceanbase/powermem).**

[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

PowerMem combines vector-based semantic search with LLM-driven intelligent memory extraction, Ebbinghaus time-decay, and multi-tenant isolation. This package is a complete TypeScript reimplementation — **zero Python dependency**.

## Features

- **Pure TypeScript** — no Python, no subprocess, no server needed
- **Triple storage backend** — SQLite (default), SeekDB (HNSW-indexed), PgVector (PostgreSQL)
- **Hybrid search** — vector cosine + FTS5 BM25 full-text scoring in SQLite
- **LLM-driven intelligent add** — extracts facts, deduplicates, merges with existing memories
- **20+ LLM/embedding providers** — dynamic registry loads any `@langchain/*` package (OpenAI, Anthropic, Ollama, Azure, Gemini, Bedrock, Cohere, Mistral, Groq, vLLM, Together, Fireworks, LM Studio…)
- **Multimodal input** — accepts `string` or `MessageInput[]` with vision/audio processing
- **Rerank** — factory-created OpenAI-compat reranker (Jina, Cohere, vLLM)
- **Multi-tenant** — userId/agentId/runId isolation on all operations
- **Sub-storage routing** — route memories to different stores by filter, with data migration
- **CLI** — `pmem` command with `--run-id`, `--metadata`, `--memory-type` options
- **Dashboard server** — Express REST API with auth, rate-limiting, Prometheus metrics, OpenAPI/Swagger, agent/user routes
- **Agent memory** — scope/permission/collaboration management for multi-agent systems
- **User profiles** — profile extraction, profile-aware search, query rewriting
- **Observability** — TelemetryCollector + AuditLogger + IntelligenceManager (importance scoring + Ebbinghaus decay)
- **BM25 sparse embedder** — CJK-aware tokenizer with Chinese/English stopwords
- **430+ tests** — unit, integration, regression, e2e, SeekDB, BDD

## Quick Start

```bash
npm install powermem-ts
```

### Simplest usage (env vars)

```env
# .env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

```typescript
import { Memory } from 'powermem-ts';

const memory = await Memory.create(); // auto-loads config from .env

await memory.add('User likes coffee', { userId: 'user1' });
const results = await memory.search('preferences', { userId: 'user1' });
console.log(results.results);

await memory.close();
```

### Config-driven creation

```typescript
import { Memory, createConfig } from 'powermem-ts';

const memory = await Memory.create({
  config: createConfig({
    embeddingProvider: 'openai',
    embeddingApiKey: 'sk-...',
    llmProvider: 'openai',
    llmApiKey: 'sk-...',
  }),
});
```

### Explicit LangChain instances

```typescript
import { Memory } from 'powermem-ts';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';

const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});
```

### Multimodal content

```typescript
await memory.add([
  { role: 'user', content: 'What is this image about?' },
  { role: 'user', content: [
    { type: 'text', text: 'Describe the architecture' },
    { type: 'image_url', image_url: { url: 'https://example.com/arch.png' } },
  ] },
], { userId: 'user1' });
```

### SeekDB backend (HNSW-indexed)

```typescript
const memory = await Memory.create({
  seekdb: { path: './seekdb_data', dimension: 1536 },
});
```

### PgVector backend (PostgreSQL)

```bash
npm install pg
```

```typescript
const memory = await Memory.create({
  config: createConfig({ databaseProvider: 'pgvector' }),
});
// Or: PGVECTOR_CONNECTION_STRING=postgresql://localhost/powermem
```

### Connect to existing PowerMem server

```typescript
const memory = await Memory.create({
  serverUrl: 'http://127.0.0.1:8000',
  apiKey: 'your-api-key',
});
```

## Provider Support

### Embedding Providers

| Provider | Package | Install needed? |
|---|---|---|
| OpenAI, Qwen, SiliconFlow, DeepSeek | `@langchain/openai` | No (peer dep) |
| Azure OpenAI | `@langchain/openai` | No |
| Ollama | `@langchain/ollama` | No (peer dep) |
| Together, Fireworks, Voyage | `@langchain/openai` (compat) | No |
| Gemini / Vertex AI | `@langchain/google-genai` | `npm install @langchain/google-genai` |
| AWS Bedrock | `@langchain/aws` | `npm install @langchain/aws` |
| Cohere | `@langchain/cohere` | `npm install @langchain/cohere` |
| Mistral | `@langchain/mistralai` | `npm install @langchain/mistralai` |
| HuggingFace | `@langchain/community` | `npm install @langchain/community` |

### LLM Providers

All embedding providers above plus: Anthropic (`@langchain/anthropic`), Groq, vLLM, LM Studio (OpenAI-compat).

## CLI

```bash
npx pmem memory add "User likes coffee" --user-id user1
npx pmem memory add "fact" --run-id r1 --metadata '{"source":"chat"}' --memory-type preference
npx pmem memory search "preferences" --user-id user1 --run-id r1
npx pmem memory list --user-id user1 --run-id r1 --sort created_at --order desc
npx pmem memory delete-all --user-id user1 --run-id r1 --confirm
npx pmem stats --json
npx pmem config show
npx pmem manage backup --output backup.json
npx pmem manage restore backup.json
npx pmem manage cleanup --strategy semantic --threshold 0.95
npx pmem shell  # Interactive REPL
```

## API

### Memory facade

| Method | Description |
|--------|-------------|
| `Memory.create(options?)` | Create instance (auto-config from env, or explicit config/LangChain instances) |
| `add(content, options?)` | Add memory — accepts string or multimodal `MessageInput[]` |
| `search(query, options?)` | Semantic search with scores, threshold, limit |
| `get(id)` | Get by ID |
| `update(id, content)` | Update content (auto re-embeds) |
| `delete(id)` | Delete by ID |
| `getAll(options?)` | List with pagination, sorting, filtering |
| `count(options?)` | Count with optional filters |
| `addBatch(items, options?)` | Batch add |
| `deleteAll(options?)` | Bulk delete with filters |
| `getStatistics(options?)` | Get memory statistics |
| `getUsers(limit?)` | List unique user IDs |
| `optimize(strategy?, userId?)` | Deduplicate memories (exact or semantic) |
| `exportMemories(options?)` | Export as MemoryRecord array |
| `importMemories(items, options?)` | Import from array |
| `migrateToSubStore(name, options?)` | Migrate records to a sub-store |
| `reset()` | Clear all |
| `close()` | Release resources |

### Configuration

| Option | Description |
|--------|-------------|
| `config` | Full `MemoryConfigInput` object (auto-resolved via `autoConfig()` if omitted) |
| `embeddings` | LangChain Embeddings instance (overrides config) |
| `llm` | LangChain BaseChatModel instance (overrides config) |
| `dbPath` | SQLite file path (default: `~/.powermem/memories.db`) |
| `seekdb` | SeekDB config: `{ path, database?, dimension?, distance? }` |
| `serverUrl` | Connect to existing server (HttpProvider mode) |
| `reranker` | Async function to re-score search results |
| `enableDecay` | Enable Ebbinghaus time-based score decay |
| `graphStore` | Optional GraphStoreBase for graph-based relations |
| `subStorageRouter` | SubStorageRouter for multi-store routing |

## Dashboard Server

```bash
npx tsx src/dashboard/server.ts
# → http://localhost:8000/dashboard/
# → http://localhost:8000/docs (Swagger UI)
# → http://localhost:8000/openapi.json
```

### Features

- **Auth**: `X-API-Key` header or `api_key` query param (`POWERMEM_SERVER_API_KEYS=key1,key2`)
- **Rate limiting**: In-memory sliding window (`POWERMEM_SERVER_RATE_LIMIT_PER_MINUTE=100`)
- **Metrics**: Prometheus format at `/api/v1/system/metrics`
- **CORS**: Configurable origins (`POWERMEM_SERVER_CORS_ORIGINS=*`)
- **Logging**: JSON/text request logging (`POWERMEM_SERVER_LOG_FORMAT=json`)

### REST API (30+ endpoints)

| Group | Endpoints |
|---|---|
| **System** | `/health`, `/status`, `/metrics`, `/delete-all-memories` |
| **Memories** | CRUD, `/search` (GET+POST), `/batch`, `/count`, `/stats`, `/users`, `/export`, `/import` |
| **Agents** | `/:agentId/memories` (list, add), `/:agentId/memories/share` (get, share) |
| **Users** | `/profiles`, `/:userId/profile`, `/:userId/memories` |

## Architecture

```
src/
├── core/           Memory facade, NativeProvider, HttpProvider, Inferrer
├── storage/        VectorStore interface, SQLiteStore, SeekDBStore, PgVectorStore, SubStorageRouter
├── integrations/   Embeddings, LLM, Rerank — registry-based factories + providers
├── intelligence/   IntelligenceManager, Ebbinghaus decay, MemoryOptimizer, ImportanceEvaluator
├── observability/  TelemetryCollector, AuditLogger
├── prompts/        LLM prompt templates (fact extraction, update, importance, graph)
├── utils/          Cosine search, Snowflake IDs, filter parser, stats, message parsing
├── cli/            Commander.js CLI (config, memory, stats, manage, shell)
├── dashboard/      Express server + middleware (auth, rate-limit, metrics, logging) + routers
├── agent/          AgentMemory, scope/permission/collaboration management
└── user-memory/    UserMemory, query rewrite, SQLite profile storage
```

## Testing

```bash
npm test              # 430 unit/integration/regression tests
npm run test:e2e      # 18 e2e tests (requires Ollama + nomic-embed-text + qwen2.5:0.5b)
npm run test:seekdb   # SeekDB tests (requires @seekdb/js-bindings)
```

CI runs 7 jobs: Node 18/20/22 unit tests, SeekDB on macOS ARM64, SeekDB on Linux x64, build verification, e2e with Ollama.

## Dependencies

**Runtime**: `better-sqlite3`, `@langchain/core`, `commander`, `express`, `zod`, `dotenv`

**Peer (install what you need)**: `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama`, `seekdb`, `pg`

## Related

- [PowerMem](https://github.com/oceanbase/powermem) — Original Python implementation
- [SeekDB](https://github.com/oceanbase/seekdb-js) — OceanBase embedded vector database

## License

Apache License 2.0
