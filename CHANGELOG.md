# Changelog

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

## v0.1.0 — NativeProvider (2026-04-01)

First release with pure TypeScript implementation. **Zero Python dependency.**

### Highlights

- **NativeProvider** replaces the Python subprocess backend — `Memory.create()` now runs entirely in TypeScript
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
  └─ default            → NativeProvider
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
| `Memory.create(options?)` | Create instance (NativeProvider by default) |
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
