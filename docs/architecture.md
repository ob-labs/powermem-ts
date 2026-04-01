# PowerMem TypeScript SDK — Architecture

## 1. Overview

PowerMem TS SDK is a pure TypeScript memory system for AI agents. It stores, retrieves, and semantically searches memories using vector embeddings, with optional LLM-driven intelligent memory extraction.

The SDK operates in two modes:

- **Native mode** (default): Pure TypeScript — SQLite storage, LangChain.js for embeddings/LLM, cosine similarity search. Zero Python dependency.
- **HTTP mode** (`serverUrl`): Connects to an existing powermem-server via HTTP. Retained for backward compatibility.

## 2. Core design concept

### Provider abstraction

The SDK is built around a single architectural idea: **the `MemoryProvider` interface decouples the public API from the implementation**.

```
┌──────────────────────────────────────────┐
│           Memory (Facade)                │  ← User-facing, never changes
│  - create() / close()                   │
│  - add / search / get / update / ...     │
├──────────────────────────────────────────┤
│        MemoryProvider (interface)         │  ← The contract
├──────────────────┬───────────────────────┤
│  NativeProvider  │    HttpProvider       │
│  Default         │    Backward compat    │
│  Pure TS         │    Remote server      │
└──────────────────┴───────────────────────┘
```

`Memory.create()` inspects options and picks the right provider. User code never references a provider directly. This made it possible to replace the entire Python backend with native TypeScript without changing a single line of user-facing API.

### Pluggable LLM/Embedding via LangChain.js

Rather than hardcoding API clients for each provider (OpenAI, Qwen, Anthropic, etc.), the SDK accepts LangChain.js base types:

- `Embeddings` from `@langchain/core/embeddings`
- `BaseChatModel` from `@langchain/core/language_models/chat_models`

Users plug in any LangChain-compatible provider. The SDK also auto-creates instances from `.env` configuration for zero-config usage.

### Faithful port of Python powermem

The NativeProvider is a direct port of the [oceanbase/powermem](https://github.com/oceanbase/powermem) Python implementation. Key behaviors preserved exactly:

- **Two-step intelligent add** (`infer=true`): extract facts via LLM → search for similar existing memories → ask LLM to decide ADD/UPDATE/DELETE/NONE → execute actions
- **Same LLM prompts**: `FACT_RETRIEVAL_PROMPT` and `DEFAULT_UPDATE_MEMORY_PROMPT` copied verbatim
- **Snowflake IDs**: 64-bit IDs matching Python's SnowflakeIDGenerator, serialized as strings
- **Cosine similarity**: Same algorithm, brute-force over filtered records
- **SQLite storage**: Same schema pattern (id, vector as JSON, payload as JSON)
- **MD5 content hashing** for deduplication
- **Access control**: userId/agentId check on get operations

## 3. Architecture layers — NativeProvider

```
NativeProvider
  │
  ├── Embedder              Wraps LangChain Embeddings
  │     └── embedQuery / embedDocuments
  │
  ├── Inferrer              Two-step LLM memory extraction
  │     ├── extractFacts()    → FACT_RETRIEVAL_PROMPT → ["fact1", "fact2"]
  │     └── decideActions()   → UPDATE_MEMORY_PROMPT  → ADD/UPDATE/DELETE/NONE
  │
  ├── SQLiteStore           SQLite via better-sqlite3
  │     ├── insert / getById / update / remove
  │     ├── list (filtered, paginated)
  │     └── search (load vectors → cosine similarity → rank)
  │
  ├── SnowflakeIDGenerator  64-bit monotonic IDs (BigInt → string)
  │
  └── cosineSimilarity()    Pure math, no dependencies
```

## 4. Project structure

```
powermem-ts/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .env.example
├── src/
│   ├── index.ts                    # Public exports
│   ├── memory.ts                   # Memory facade
│   ├── types/
│   │   ├── index.ts                #   Re-exports
│   │   ├── memory.ts               #   MemoryRecord, AddParams, SearchParams, etc.
│   │   ├── options.ts              #   MemoryOptions (embeddings, llm, dbPath, serverUrl)
│   │   └── responses.ts            #   AddResult, SearchResult, etc.
│   ├── errors/
│   │   └── index.ts                # PowerMemError hierarchy
│   ├── provider/
│   │   ├── index.ts                # MemoryProvider interface
│   │   ├── http-provider.ts        # HTTP implementation (backward compat)
│   │   └── native/
│   │       ├── index.ts            # NativeProvider (main class)
│   │       ├── vector-store.ts     # VectorStore interface (abstract)
│   │       ├── store.ts            # SQLiteStore (VectorStore implementation)
│   │       ├── embedder.ts         # LangChain Embeddings wrapper
│   │       ├── inferrer.ts         # LLM fact extraction + action decision
│   │       ├── prompts.ts          # LLM prompt templates (from Python)
│   │       ├── search.ts           # Cosine similarity
│   │       ├── decay.ts            # Ebbinghaus memory decay
│   │       ├── snowflake.ts        # Snowflake ID generator
│   │       └── provider-factory.ts # Env-based auto-creation
│   ├── server/                     # (Legacy) Python server management
│   │   ├── python-env.ts
│   │   └── server-manager.ts
│   └── utils/
│       ├── platform.ts             # Cross-platform path helpers
│       ├── case-convert.ts         # camelCase ↔ snake_case
│       └── env.ts                  # .env file loader
├── tests/
│   ├── mocks.ts                    # MockEmbeddings, MockLLM
│   ├── snowflake.test.ts           # Unit: ID generation
│   ├── search.test.ts              # Unit: cosine similarity
│   ├── store.test.ts               # Unit: SQLiteStore CRUD + sort + count
│   ├── decay.test.ts               # Unit: Ebbinghaus decay math
│   ├── embedder.test.ts            # Unit: embedding wrapper
│   ├── inferrer.test.ts            # Unit: LLM extraction + custom prompts
│   ├── native-provider.test.ts     # Integration: full provider
│   ├── memory-facade.test.ts       # Integration: public API
│   ├── provider-factory.test.ts    # Unit: env-based factory
│   ├── coverage-gaps.test.ts       # Integration: edge cases
│   ├── sorting-combos.test.ts      # Combinatorial: sortBy × order × pagination
│   ├── edge-cases.test.ts          # Boundary: invalid IDs, empty stores, limits
│   ├── multi-agent.test.ts         # Concurrency + isolation
│   ├── custom-integration.test.ts  # Custom prompts, reranker, fallback
│   ├── ebbinghaus.test.ts          # Decay: curve, reinforcement, ordering
│   ├── multi-language.test.ts      # I18n: CJK, Arabic, emoji, unicode
│   ├── e2e-ollama.test.ts          # E2E: all features with real Ollama
│   └── e2e-agent-scenario.test.ts  # E2E: real-world agent scenarios
└── examples/
    └── basic-usage.ts
```

Runtime data directory (auto-created):

```
~/.powermem/
└── memories.db               # SQLite database (NativeProvider)
```

## 5. Key flows

### 5.1 Instance creation (`Memory.create()`)

```
Memory.create(options?)
  │
  ├─ Load .env file
  │
  ├─ Has serverUrl?
  │   ├─ Yes → HttpProvider (backward compat)
  │   └─ No  → NativeProvider (default)
  │
  └─ NativeProvider.create():
      ├─ Resolve dbPath (default ~/.powermem/memories.db)
      ├─ Create SQLite database (SQLiteStore)
      ├─ Set up Embedder:
      │   ├─ options.embeddings provided? → Use it
      │   └─ Not provided → createEmbeddingsFromEnv()
      ├─ Set up Inferrer (optional):
      │   ├─ options.llm provided? → Use it
      │   ├─ Not provided → try createLLMFromEnv()
      │   └─ No LLM config → inferrer = undefined (infer disabled)
      └─ Return NativeProvider instance
```

### 5.2 Simple add (`infer=false`)

```
add({ content, userId, ... , infer: false })
  │
  ├─ Generate Snowflake ID
  ├─ Embed content → vector
  ├─ MD5 hash content
  ├─ Store in SQLite: { id, vector, payload }
  └─ Return AddResult with 1 MemoryRecord
```

### 5.3 Intelligent add (`infer=true`, default)

```
add({ content, userId, ... })
  │
  ├─ Step 1: Extract facts
  │   └─ LLM(FACT_RETRIEVAL_PROMPT, content) → ["fact1", "fact2", ...]
  │
  ├─ Step 2: Find similar existing memories
  │   └─ For each fact:
  │       ├─ Embed fact → vector
  │       └─ Search SQLite for top-5 similar (filtered by userId/agentId/runId)
  │   └─ Deduplicate, keep best scores, max 10 candidates
  │
  ├─ Step 3: Map IDs
  │   └─ Real Snowflake IDs → temp sequential IDs ("0","1","2"...)
  │       (prevents LLM from hallucinating IDs)
  │
  ├─ Step 4: Decide actions
  │   └─ LLM(UPDATE_MEMORY_PROMPT, existing_memories, new_facts)
  │       → [{ id, text, event: ADD|UPDATE|DELETE|NONE }]
  │
  └─ Step 5: Execute actions
      ├─ ADD    → new Snowflake ID, embed, store
      ├─ UPDATE → map temp→real ID, embed new text, update store
      ├─ DELETE → map temp→real ID, remove from store
      └─ NONE   → skip (duplicate)
```

### 5.4 Search

```
search({ query, userId, limit })
  │
  ├─ Embed query → vector
  ├─ Load all matching records from SQLite (filtered by userId/agentId/runId)
  ├─ Compute cosine similarity for each
  ├─ Sort descending by score
  ├─ Return top-k as SearchResult
  └─ Each result: { memoryId, content, score, metadata }
```

## 6. Storage — SQLite schema

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,          -- Snowflake ID as string
  vector TEXT,                  -- JSON array of floats
  payload TEXT,                 -- JSON blob (see below)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Payload JSON structure:
```json
{
  "data": "the actual content text",
  "user_id": "user123",
  "agent_id": "agent1",
  "run_id": "run1",
  "hash": "md5-hex-of-content",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "category": null,
  "metadata": { "custom": "user metadata" }
}
```

Filtering uses `json_extract()` on the payload column. Vector search is brute-force cosine similarity in JavaScript — efficient for datasets up to ~100K records.

## 7. Dependencies

**Runtime:**
- `better-sqlite3` — Synchronous SQLite bindings (native addon)
- `@langchain/core` — Base types for Embeddings and LLM
- `dotenv` — .env file loading

**Peer (user installs what they need):**
- `@langchain/openai` — OpenAI, Qwen, SiliconFlow, DeepSeek (OpenAI-compatible)
- `@langchain/anthropic` — Anthropic Claude
- `@langchain/ollama` — Local Ollama models

**Dev:**
- `typescript`, `tsup`, `vitest`, `@vitest/coverage-v8`, `@types/better-sqlite3`

## 8. Configuration

Two ways to configure embeddings/LLM:

**Explicit (recommended for libraries):**
```ts
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});
```

**Env-based (zero-config):**
```bash
# .env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```
```ts
const memory = await Memory.create(); // reads from .env
```

Supported providers for env-based auto-creation:

| Provider | Embedding | LLM | Package |
|----------|-----------|-----|---------|
| `openai` | Yes | Yes | `@langchain/openai` |
| `qwen` | Yes | Yes | `@langchain/openai` |
| `siliconflow` | Yes | Yes | `@langchain/openai` |
| `deepseek` | Yes | Yes | `@langchain/openai` |
| `anthropic` | No | Yes | `@langchain/anthropic` |
| `ollama` | Yes | Yes | `@langchain/ollama` |

## 9. Error hierarchy

| Error class | Code | Trigger |
|-------------|------|---------|
| `PowerMemError` | (base) | Base class for all SDK errors |
| `PowerMemInitError` | `INIT_ERROR` | Missing env config, LangChain package not installed |
| `PowerMemStartupError` | `STARTUP_ERROR` | Server timeout (HTTP mode only) |
| `PowerMemConnectionError` | `CONNECTION_ERROR` | Cannot reach server (HTTP mode only) |
| `PowerMemAPIError` | `API_ERROR` | Server error response (HTTP mode only) |

## 10. Build output

Dual-format via `tsup`:

| File | Format | Purpose |
|------|--------|---------|
| `dist/index.js` | ESM | `import from 'powermem-ts'` |
| `dist/index.cjs` | CommonJS | `require('powermem-ts')` |
| `dist/index.d.ts` | TypeScript declarations | Type support |

`better-sqlite3` and `@langchain/*` are externalized (not bundled).

## 11. Test architecture

208 tests total: **187 unit tests** (mocked, fast) + **21 e2e tests** (real Ollama models).

Tests are organized by 6 testing perspectives (learned from the Python powermem test suite):

### Unit tests (187 tests, 16 files)

Mock infrastructure:
- `MockEmbeddings` — Deterministic vectors from character frequency (no API calls)
- `MockLLM` — Pre-configured response queue with call tracking

| Test file | Tests | Perspective |
|-----------|-------|-------------|
| `snowflake.test.ts` | 4 | Unit — ID generation |
| `search.test.ts` | 6 | Unit — Cosine similarity |
| `store.test.ts` | 25 | Unit — SQLiteStore CRUD, count, sort, access count |
| `embedder.test.ts` | 4 | Unit — Embedding wrapper |
| `inferrer.test.ts` | 11 | Unit — LLM fact extraction, actions, custom prompts |
| `decay.test.ts` | 8 | Unit — Ebbinghaus decay math |
| `native-provider.test.ts` | 41 | Integration — Full provider, all features |
| `memory-facade.test.ts` | 8 | Integration — Public API through facade |
| `provider-factory.test.ts` | 9 | Unit — Env-based factory |
| `coverage-gaps.test.ts` | 14 | Integration — Edge cases, filter branches |
| `sorting-combos.test.ts` | 11 | **Combinatorial** — sortBy × order × pagination 3D combos |
| `edge-cases.test.ts` | 22 | **Boundary** — Invalid IDs, empty stores, idempotent ops, long content |
| `multi-agent.test.ts` | 6 | **Concurrency + Isolation** — Parallel writes, agent data isolation |
| `custom-integration.test.ts` | 8 | **Custom integration** — All customization points together |
| `ebbinghaus.test.ts` | 9 | **Decay math** — Exponential curve, reinforcement, search ordering |
| `multi-language.test.ts` | 8 | **Multi-language** — CJK, Japanese, Arabic, emoji, unicode metadata |

### E2E tests with real models (21 tests, 2 files)

Models: `qwen2.5:0.5b` (LLM) + `nomic-embed-text` (embedding). Auto-skipped when Ollama unavailable.

| Test file | Tests | Scenario |
|-----------|-------|----------|
| `e2e-ollama.test.ts` | 18 | Full feature verification with real embeddings and LLM |
| `e2e-agent-scenario.test.ts` | 3 | **Scenario-based** — Personal assistant, 10-round conversation, multi-agent isolation |

### Testing perspectives

These 6 perspectives go beyond "does the feature work" — each catches a different class of bug:

1. **Combinatorial** — Parameter interaction bugs (sort + filter + pagination)
2. **Boundary/edge** — Implicit assumption bugs (empty, zero, huge, special chars)
3. **Concurrency** — Thread-safety bugs (parallel writes, interleaved read+write)
4. **Multi-tenant isolation** — Filter leaks (same user different agent, scoped deletes)
5. **Multi-language** — Encoding bugs (CJK in JSON payload, unicode metadata keys)
6. **Scenario-based** — Integration bugs (real-world multi-step workflows)

### Running tests

```bash
npm test          # Unit tests only (fast, no external deps)
npm run test:e2e  # E2E tests (requires Ollama + models)
npm run test:all  # Both
```
