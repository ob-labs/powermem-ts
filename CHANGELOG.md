# Changelog

## v0.3.0 — Full Python Parity (2026-04-03)

Complete TypeScript replication of Python `oceanbase/powermem`. 89 source files, 10 modules, 504 tests.

### Directory Restructure
- Reorganized from flat `provider/native/` to Python-matching module layout
- Tests restructured into `unit/`, `integration/`, `regression/`, `e2e/`, `bdd/`
- Deleted legacy `src/server/` (Python subprocess bridge)

### New Modules
- **Config system**: `configs.ts` (Zod schemas), `config-loader.ts` (env auto-detection), `settings.ts`, `version.ts`
- **Storage module**: `VectorStoreFactory` (provider registry), `StorageAdapter`, typed configs
- **Integrations**: `embeddings/`, `llm/`, `rerank/` base interfaces + factory pattern
- **Intelligence**: `MemoryOptimizer` (exact + semantic dedup, LLM compression), `ImportanceEvaluator`, `IntelligenceManager`
- **Prompts**: importance evaluation, optimization, query rewrite, user profile, graph extraction/update/deletion
- **Utils**: `filter-parser`, `stats` (byType, growth trend, age distribution), `io` (JSON/CSV)
- **CLI**: `pmem config show|validate|test`, `pmem memory add|search|list|get|delete|delete-all`, `pmem stats`, `pmem manage backup|restore|cleanup`, `pmem shell` (interactive REPL)
- **Dashboard**: Express server + HTML SPA (overview stats/charts, memories table, settings, dark/light theme)
- **Agent module**: `AgentMemory`, 7 enums, scope/permission/collaboration strategy interfaces, `ScopeController`, `PermissionController`, `AgentFactory`
- **User memory**: `UserMemory` (profile-aware search), `QueryRewriter`, `SQLiteUserProfileStore`
- **Graph store**: `GraphStoreBase` interface, graph prompts

### SeekDB Improvements
- `embeddingFunction: null` to disable auto-vectorization (pass pre-computed embeddings)
- Base64-encoded metadata to bypass C engine JSON parser limitations
- Sequential test execution to avoid concurrent embedded engine init
- CI: macOS ARM64 (bundled bindings) + Linux x64 (S3 download + libaio symlink)

### Tests (504 total)
- 370 unit/integration/regression (Node 18/20/22)
- 63 SeekDB (macOS ARM64 + Linux x64)
- 21 e2e with real Ollama models
- 50 BDD (19 CLI + 16 dashboard UI + 15 data correctness)

### CI (7 jobs, all green)
- Test Node 18/20/22 (Ubuntu)
- SeekDB macOS ARM64 (macos-14)
- SeekDB Linux x64 (Ubuntu, S3 download + libaio1t64 symlink)
- Build (CJS + ESM + DTS + CLI)
- E2E Ollama (Ubuntu)

---

## v0.2.0 — Feature Enhancement (2026-04-01)

### P0 — API Layer
- **`getAll` sorting**: `sortBy` and `order` params — sort by any payload field (`created_at`, `updated_at`, `category`, etc.)
- **`search` threshold**: `threshold` param — filter out results below a minimum cosine similarity score
- **`add` scope/category**: `scope` and `category` fields on `AddParams`, `BatchItem`, `BatchOptions` — stored in payload, returned in `MemoryRecord`
- **`count()` method**: New method on `MemoryProvider` / `Memory` facade — count records with optional `userId`/`agentId` filter
- **Custom prompts**: `customFactExtractionPrompt` and `customUpdateMemoryPrompt` in `MemoryOptions` — override default LLM prompts
- **`fallbackToSimpleAdd`**: When intelligent add produces no facts/actions, fall back to simple add instead of returning empty

### P0 — Architecture
- **`VectorStore` interface** (`src/provider/native/vector-store.ts`): Abstract storage layer with `insert`, `getById`, `update`, `remove`, `list`, `search`, `count`, `incrementAccessCount`, `removeAll`, `close`. `SQLiteStore` (SQLite) is the first implementation. Future backends (OceanBase, PgVector) implement this same interface.
- Exported `VectorStore`, `VectorStoreRecord`, `VectorStoreFilter`, `VectorStoreSearchMatch`, `VectorStoreListOptions` types

### P1 — Functionality
- **Reranker**: Optional `reranker` function in `MemoryOptions` — async callback that re-scores/reorders search results after cosine similarity
- **Access count tracking**: `access_count` in payload, auto-incremented on `get()` and `search()`. Exposed as `accessCount` on `MemoryRecord`
- **Ebbinghaus memory decay**: `enableDecay` + `decayWeight` in `MemoryOptions` — time-based score adjustment using forgetting curve. Memories accessed more frequently decay slower (stability increases with `access_count`)

### Types
- `RerankerFn` type exported from `src/types/options.ts`
- `MemoryRecord` gains `scope`, `category`, `accessCount` fields
- `SearchParams` gains `threshold`
- `GetAllParams` gains `sortBy`, `order`
- `AddParams`/`BatchItem`/`BatchOptions` gain `scope`, `category`

### Tests
- 124 unit tests (+29 new) covering all features
- 18 e2e tests with real Ollama models (unchanged)

---

## v0.1.0 — TypeScript Runtime (2026-04-01)

First release with pure TypeScript implementation. **Zero Python dependency.**

### Highlights

- **TypeScript runtime** replaces the Python subprocess backend — `Memory.create()` now runs entirely in TypeScript
- **SQLite storage** via `better-sqlite3` — persistent, single-file database at `~/.powermem/memories.db`
- **LangChain.js integration** — plug in any `@langchain/*` provider for embeddings and LLM
- **Intelligent memory add** (`infer=true`) — LLM extracts atomic facts, deduplicates against existing memories, decides ADD/UPDATE/DELETE/NONE
- **Semantic search** — cosine similarity over real embedding vectors
- **Multi-tenant isolation** — userId/agentId/runId filtering on all operations
- **Backward compatible** — `Memory.create({ serverUrl })` still connects to a remote powermem-server via HTTP

### Architecture

```
Memory.create()
  ├─ serverUrl provided → HttpProvider (backward compat)
  └─ default            → local Memory runtime
                            ├─ SQLite (better-sqlite3)
                            ├─ Embeddings (@langchain/core)
                            ├─ LLM inference (@langchain/core)
                            ├─ Cosine similarity search
                            └─ Snowflake ID generator
```

### API

All operations go through the `Memory` facade — unchanged from the original design:

```ts
const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});

await memory.add('User likes coffee', { userId: 'u1' });
const results = await memory.search('preferences', { userId: 'u1' });
```

Or zero-config with `.env`:

```ts
const memory = await Memory.create(); // reads EMBEDDING_PROVIDER, LLM_PROVIDER, etc.
```

### Full API surface

| Method | Description |
|--------|-------------|
| `Memory.create(options?)` | Create instance (local runtime by default) |
| `Memory.init()` | No-op (retained for backward compat) |
| `add(content, options?)` | Add memory (with optional LLM fact extraction) |
| `search(query, options?)` | Semantic similarity search |
| `get(id)` | Retrieve by ID |
| `update(id, content, options?)` | Update content (re-embeds automatically) |
| `delete(id)` | Delete by ID |
| `getAll(options?)` | List with filtering + pagination |
| `addBatch(items, options?)` | Batch add |
| `deleteAll(options?)` | Delete filtered or all |
| `reset()` | Clear everything |
| `close()` | Release resources |

### Dependencies

- **Runtime**: `better-sqlite3`, `@langchain/core`, `dotenv`
- **Peer** (install what you need): `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama`

### Tests

- 95 unit tests (mocked, fast)
- 18 e2e tests with real Ollama models (`qwen2.5:0.5b` + `nomic-embed-text`)
- 95% line coverage, 83% branch coverage
