# PowerMem TypeScript SDK — Architecture (v0.4.0)

## 1. Overview

Pure TypeScript port of [oceanbase/powermem](https://github.com/oceanbase/powermem). Zero Python dependency. Full Python parity across 13 alignment areas (issue #7).

Three storage backends:
- **SQLite** (default) — `better-sqlite3`, brute-force cosine similarity + FTS5 hybrid search
- **SeekDB** (optional) — OceanBase embedded engine, HNSW-indexed vector search
- **PgVector** (optional) — PostgreSQL + pgvector extension, HNSW-indexed

## 2. Module Structure

```
src/
├── core/                  Memory facade, NativeProvider, HttpProvider, Inferrer
│   ├── memory.ts          Main entry — create(), add(), search(), get(), update(), delete()
│   │                      getStatistics(), getUsers(), optimize(), exportMemories(),
│   │                      importMemories(), migrateToSubStore()
│   ├── native-provider.ts Local implementation — embedder + inferrer + intelligence + graph + sub-storage
│   ├── http-provider.ts   Remote client — talks to dashboard REST API
│   ├── provider.ts        MemoryProvider interface
│   └── inferrer.ts        LLM-driven fact extraction + action decisions
│
├── storage/               VectorStore interface + implementations
│   ├── base.ts            VectorStore, VectorStoreRecord, GraphStoreBase interfaces
│   ├── sqlite/            SQLiteStore — cosine search + FTS5 hybrid search
│   ├── seekdb/            SeekDBStore — HNSW-indexed (optional peer dep)
│   ├── pgvector/          PgVectorStore — PostgreSQL + pgvector (optional: npm install pg)
│   ├── sub-storage.ts     SubStorageRouter + SubStoreMigrationManager
│   ├── adapter.ts         StorageAdapter — higher-level operations over VectorStore
│   └── factory.ts         VectorStoreFactory — registry: sqlite, seekdb, pgvector/postgres/pg
│
├── integrations/          Registry-based factories for 20+ providers
│   ├── embeddings/
│   │   ├── factory.ts     createEmbeddings() — 3-tier: built-in → registry → auto-discovery
│   │   ├── sparse.ts      BM25SparseEmbedder, tokenize, tokenizeCJK, CHINESE_STOPWORDS
│   │   └── embedder.ts    Embedder wrapper class
│   ├── llm/
│   │   └── factory.ts     createLLM() — same 3-tier pattern
│   └── rerank/
│       ├── factory.ts     createReranker(), createRerankerFnFromConfig()
│       └── openai-compat.ts  OpenAICompatReranker (Jina, Cohere, vLLM)
│
├── intelligence/          Memory intelligence features
│   ├── manager.ts         IntelligenceManager — importance scoring + Ebbinghaus decay
│   ├── ebbinghaus.ts      computeDecayFactor(), applyDecay()
│   ├── memory-optimizer.ts MemoryOptimizer — exact/semantic dedup + LLM compression
│   └── importance-evaluator.ts Rule-based importance scoring (0-1)
│
├── observability/         Runtime observability
│   ├── telemetry.ts       TelemetryCollector — event tracking + flush
│   └── audit.ts           AuditLogger — JSON-lines file logging with level filtering
│
├── prompts/               LLM prompt templates
│   ├── fact-retrieval.ts  Fact extraction from content
│   ├── update-memory.ts   ADD/UPDATE/DELETE/NONE decisions
│   └── graph/             Graph entity/relation extraction (interface ready)
│
├── utils/
│   ├── messages.ts        Multimodal: extractTextFromContent, parseVisionMessages, parseAudioMessages
│   ├── search.ts          cosineSimilarity()
│   ├── snowflake.ts       Snowflake ID generator
│   ├── stats.ts           calculateStatsFromMemories()
│   └── filter-parser.ts   Advanced filter parsing
│
├── cli/                   Commander.js CLI
│   ├── main.ts            pmem entry point
│   └── commands/          config, memory, stats, manage, interactive shell
│
├── dashboard/             Express server — full REST API
│   ├── server.ts          App setup + router registration
│   ├── config.ts          ServerConfig from env vars
│   ├── openapi.ts         OpenAPI 3.0 spec builder (30+ paths, schemas, security)
│   ├── middleware/
│   │   ├── auth.ts        X-API-Key header + api_key query param
│   │   ├── rate-limit.ts  In-memory sliding window per IP
│   │   ├── metrics.ts     Prometheus counters + histograms
│   │   └── logging.ts     JSON/text request logging
│   └── routers/
│       ├── system.ts      /health, /status, /metrics, /delete-all-memories
│       ├── memories.ts    Full CRUD + search + batch + export/import + stats/count/users
│       ├── agents.ts      Agent-scoped memories + sharing
│       └── users.ts       User profiles + user-scoped memories
│
├── agent/                 AgentMemory — multi-agent scope/permission/collaboration
├── user-memory/           UserMemory — profile extraction, query rewriting
├── configs.ts             Zod schemas for MemoryConfig
├── config-loader.ts       autoConfig(), loadConfigFromEnv(), createConfig()
└── index.ts               Public exports (90+ symbols)
```

## 3. Key Flows

### Memory.create()
```
Memory.create(options)
  ├─ serverUrl provided → HttpProvider
  └─ else:
     ├─ Parse config: options.config ?? autoConfig() → parseMemoryConfig()
     ├─ Resolve VectorStore: seekdb > dbPath > VectorStoreFactory.create()
     ├─ Resolve Embeddings: explicit > config-driven > env-based
     ├─ Resolve LLM: explicit > config-driven > env-based (optional)
     ├─ Resolve Reranker: explicit > config-driven (optional)
     ├─ Create IntelligenceManager (if decay enabled)
     └─ NativeProvider.create(store, embedder, inferrer, ...)
```

### Intelligent add (infer=true)
```
add(content)
  → resolveTextContent(content)  // multimodal: vision LLM + audio ASR
  → LLM extracts facts (FACT_RETRIEVAL_PROMPT)
  → Embed each fact → search for similar existing memories
  → No existing? → ADD all facts directly
  → Has existing? → LLM decides ADD/UPDATE/DELETE/NONE
  → Execute actions
  → IntelligenceManager.processMetadata() → importance score
  → SubStorageRouter.routeToStore() → target store
  → GraphStore.add() (if configured, non-blocking)
```

### Search
```
search(query)
  → Embed query
  → SubStorageRouter.routeToStore() → target store
  → cosine similarity (SQLite/PgVector) or HNSW (SeekDB)
  → IntelligenceManager.processSearchResults() → Ebbinghaus decay
  → Apply threshold filter
  → Increment access counts
  → Apply reranker (if configured)
  → GraphStore.search() → relations (if configured)
```

### Hybrid Search (SQLite only)
```
hybridSearch(queryVector, queryText)
  → Vector cosine similarity → scored results
  → FTS5 BM25 MATCH → text-scored results
  → Weighted combination: vectorWeight * cosine + textWeight * bm25
  → Sorted by combined score
```

## 4. Storage Backends

### SQLite (default)
- Schema: `memories(id, vector, payload)` + `memories_fts(id, content)` (FTS5)
- Vector search: brute-force cosine similarity in JavaScript
- Hybrid search: `hybridSearch()` combines cosine + FTS5 BM25 scores
- FTS5 table auto-synced on insert/update/remove

### SeekDB (HNSW-indexed)
- Embedded mode via `seekdb` npm package (local file, no server)
- HNSW vector index with configurable dimension/distance
- Score: `1 - cosine_distance`
- Requires `@seekdb/js-bindings` (macOS ARM64, Linux x64)

### PgVector (PostgreSQL)
- Requires: `npm install pg`
- Schema: proper columns (content, user_id, agent_id, etc.) + `vector(N)` for embedding
- HNSW index via `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`
- Score: `1 - (embedding <=> query)` (cosine distance → similarity)
- Env: `PGVECTOR_CONNECTION_STRING` or standard PG* vars

### Sub-Storage Router
- Routes operations to different VectorStores based on dict-filter or function-match
- Migration: `migrateToSubStore()` — moves records with re-embedding, progress tracking
- State machine: pending → migrating → completed/failed

## 5. Provider System

### 3-Tier Resolution (Embeddings + LLMs)

1. **Built-in** — OpenAI-compat (openai/qwen/siliconflow/deepseek), Ollama, Anthropic
2. **Registry** — 15+ named providers with known package/class mappings (Azure, Gemini, Bedrock, Cohere, Mistral, Together, Fireworks, Groq, vLLM, LM Studio, Voyage, HuggingFace)
3. **Auto-discovery** — tries `@langchain/<name>` with standard class naming

Missing packages produce actionable errors: `Provider "gemini" requires "@langchain/google-genai". Install it: npm install @langchain/google-genai`

### Rerank
- Factory: `createReranker({ provider: 'jina', apiKey: '...' })`
- OpenAI-compat implementation: calls `/v1/rerank` endpoint (Jina, Cohere, vLLM)
- Wired via `createRerankerFnFromConfig()` → `RerankerFn` callback

## 6. Multimodal Support

`add()` accepts `string | MessageInput[]` where `MessageInput` follows the OpenAI message format:

```typescript
await memory.add([
  { role: 'user', content: [
    { type: 'text', text: 'Describe this' },
    { type: 'image_url', image_url: { url: 'https://...' } },
    { type: 'audio', audio_url: 'https://...' },
  ] },
]);
```

- **Vision**: If LLM is vision-capable, images are described via `parseVisionMessages()` and inlined as `[Image description: ...]`
- **Audio**: If `WHISPER_API_URL` / `ASR_API_URL` is configured, audio is transcribed via `parseAudioMessages()` and inlined as `[Transcript: ...]`
- **Fallback**: Without LLM/ASR, images/audio become `[image]`/`[audio]` placeholders

## 7. Dashboard Server

### Middleware Stack (in order)
1. CORS (configurable origins)
2. Request logging (JSON/text format)
3. Prometheus metrics collection
4. API key authentication (X-API-Key header or api_key query)
5. Rate limiting (sliding window per IP)

### Route Groups
- `/api/v1/system` — health, status, metrics, admin delete-all
- `/api/v1/memories` — full CRUD, search (GET+POST), batch, count, stats, users, export, import
- `/api/v1/agents` — agent-scoped memories, sharing between agents
- `/api/v1/users` — user profiles, user-scoped memories

### OpenAPI
- `GET /openapi.json` — full OpenAPI 3.0.3 spec with schemas and security
- `GET /docs` — Swagger UI

## 8. CLI

```
pmem config show|validate|test
pmem memory add <content> [--user-id] [--agent-id] [--run-id] [--metadata <json>] [--memory-type] [--no-infer]
pmem memory search <query> [--user-id] [--run-id] [--limit] [--threshold]
pmem memory list [--user-id] [--run-id] [--sort] [--order] [--limit] [--offset]
pmem memory get <id>
pmem memory delete <id>
pmem memory delete-all [--user-id] [--run-id] [--confirm]
pmem stats [--user-id] [--json]
pmem manage backup|restore|cleanup
pmem shell
```

## 9. Test Architecture

430+ tests across 47 files, 7 CI jobs.

| Layer | Tests | Description |
|-------|-------|-------------|
| Unit | 340+ | Per-module with mocks — includes sparse embedder, messages, observability, rerank, sub-storage, hybrid search, dashboard middleware, extended API |
| Integration | 46 | Full stack with real SQLite |
| Regression | 58 | Scenarios, edge cases, language |
| E2E (Ollama) | 18 | Real qwen2.5:0.5b + nomic-embed-text |
| SeekDB | 15+ | Unit + integration + e2e (macOS ARM64 + Linux x64) |
| BDD | 19+ | CLI subprocess tests |

### CI Jobs

| Job | Platform | What |
|-----|----------|------|
| Test (Node 18/20/22) | Ubuntu | Unit + integration + regression |
| SeekDB (macOS ARM64) | macOS 14 | SeekDB tests |
| SeekDB (Linux x64) | Ubuntu | SeekDB tests |
| Build | Ubuntu | CJS + ESM + DTS + CLI |
| E2E (Ollama) | Ubuntu | End-to-end with real LLM |

## 10. Python Parity Status

| Issue #7 Section | Status | Details |
|---|---|---|
| 1. Entry API & Config | Done | Config-driven Memory.create(), AsyncMemory alias |
| 2. Storage backends | Done | SQLite + SeekDB + PgVector |
| 3. Graph + Hybrid search | Done (scaffold) | Graph wiring + FTS5 hybrid search + BM25 sparse |
| 4. Embeddings & Multimodal | Done | 20+ providers, multimodal add(), vision/audio parsing |
| 5. LLM integrations | Done | Registry-based, 20+ providers |
| 6. Rerank | Done | Factory + OpenAI-compat provider |
| 7. Observability | Done | Telemetry + Audit + IntelligenceManager wired |
| 8. Memory API | Done | 6 new methods on Memory class |
| 9. Sub-storage | Done | SubStorageRouter + migration state machine |
| 10. CLI | Done | --run-id, --metadata, --memory-type |
| 11. Server/Dashboard | Done | Auth, rate-limit, metrics, CORS, logging, agents, users, OpenAPI |
| 12. Versioning | Done | v0.4.0 |
| 13. Core CRUD | Done | Pre-existing |

**Remaining**: OceanBase storage backend (no JS driver), concrete GraphStore implementation (needs OceanBase Graph).
