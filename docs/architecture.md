# PowerMem TypeScript SDK — Architecture

## 1. Overview

PowerMem TS SDK provides a native TypeScript interface for [PowerMem](https://github.com/oceanbase/powermem). It manages the Python-based PowerMem server as a subprocess, communicating via localhost HTTP. All implementation details (Python environment, server lifecycle, HTTP protocol) are transparent to the user.

The SDK is designed with a **provider abstraction** — the current implementation uses HTTP, but can be replaced with a native TS implementation in the future without changing the public API.

## 2. Architecture layers

```
┌──────────────────────────────────────────┐
│           Memory (Facade)                │  ← User-facing entry point
│  - init() / create() / close()           │
│  - add / search / get / update / ...     │
├──────────────────────────────────────────┤
│        MemoryProvider (interface)         │  ← Abstract contract
├──────────────────┬───────────────────────┤
│   HttpProvider   │  (Future)             │
│   Current impl   │  NativeProvider       │
│   via localhost   │  Pure TS impl        │
├──────────────────┴───────────────────────┤
│        ServerManager                     │  ← Server subprocess lifecycle
│  - spawn / health check / shutdown       │
├──────────────────────────────────────────┤
│        PythonEnvManager                  │  ← Python environment management
│  - detect Python / create venv / install │
├──────────────────────────────────────────┤
│        Utils                             │  ← Cross-platform helpers
│  - platform / case-convert / env loader  │
└──────────────────────────────────────────┘
```

## 3. Project structure

```
powermem-ts/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── .env.example
├── src/
│   ├── index.ts              # Public exports
│   ├── memory.ts             # Memory Facade
│   ├── types/                # TypeScript type definitions
│   │   ├── index.ts          #   Re-exports
│   │   ├── memory.ts         #   MemoryRecord, AddParams, SearchParams, etc.
│   │   ├── options.ts        #   MemoryOptions, InitOptions
│   │   └── responses.ts      #   AddResult, SearchResult, etc.
│   ├── errors/               # Error class hierarchy
│   │   └── index.ts
│   ├── provider/             # Provider abstraction
│   │   ├── index.ts          #   MemoryProvider interface
│   │   └── http-provider.ts  #   HTTP implementation
│   ├── server/               # Server & Python env management
│   │   ├── python-env.ts     #   PythonEnvManager
│   │   └── server-manager.ts #   ServerManager
│   └── utils/                # Shared utilities
│       ├── platform.ts       #   Cross-platform path helpers
│       ├── case-convert.ts   #   camelCase <-> snake_case
│       └── env.ts            #   .env file loader
└── examples/
    ├── basic-usage.ts
    └── with-existing-server.ts
```

Runtime-managed directory (auto-created on user's machine):

```
~/.powermem/
├── venv/                     # Python virtualenv (created by init)
│   └── bin/powermem-server   # Installed with powermem package
└── init.lock                 # Concurrency lock (removed after init)
```

## 4. Key flows

### 4.1 Initialization (`Memory.init()`)

```
Memory.init(options?)
  │
  ├─ Check ~/.powermem/venv/ exists?
  │   ├─ Yes → Check powermem installed? (pip show powermem)
  │   │         ├─ Installed → Skip, done ✓
  │   │         └─ Not installed → Go to step 3
  │   └─ No → Continue
  │
  ├─ Detect system Python
  │   ├─ Try: options.pythonPath → python3 → python
  │   ├─ Require version >= 3.11
  │   │   └─ Not found → throw PowerMemInitError
  │   └─ Create venv: python -m venv ~/.powermem/venv
  │
  ├─ Install powermem
  │   └─ pip install <powermemVersion> [pipArgs]
  │
  └─ Verify: powermem-server binary exists?
      ├─ Yes → Done ✓
      └─ No → throw PowerMemInitError
```

Idempotent — safe to call multiple times:

| Scenario | Behavior |
|----------|----------|
| First init | Create venv → pip install → verify |
| Already installed | Detect and skip |
| venv exists, powermem missing | Skip venv creation → pip install |
| Corrupted venv | Remove and recreate |
| `create()` without prior `init()` | Auto-triggers `init()` |

### 4.2 Instance creation (`Memory.create()`)

```
Memory.create(options?)
  │
  ├─ Has serverUrl?
  │   ├─ Yes → Direct connect mode (skip all auto-start)
  │   └─ No → Auto-start mode
  │
  ├─ Load .env file
  │
  ├─ Check init completed?
  │   └─ No → Auto-call Memory.init()
  │
  ├─ Health check http://127.0.0.1:{port}
  │   ├─ Pass → Server already running, reuse
  │   └─ Fail → Spawn: powermem-server --host 127.0.0.1 --port {port}
  │
  ├─ Poll GET /api/v1/system/health (500ms interval)
  │   ├─ Pass → Server ready
  │   └─ Timeout → throw PowerMemStartupError
  │
  └─ Create HttpProvider → Return Memory instance
```

### 4.3 Two modes of operation

**Auto-start mode** (default): SDK manages the full lifecycle — Python env, server process, HTTP communication.

```
User code → Memory Facade → HttpProvider → localhost HTTP → powermem-server (subprocess)
```

**Direct connect mode** (`serverUrl` provided): SDK only handles HTTP communication, no subprocess management.

```
User code → Memory Facade → HttpProvider → remote/existing server
```

## 5. Communication protocol

```
TS SDK ──HTTP (127.0.0.1:19527)──> powermem-server (uvicorn)
```

- Default port: `19527` (configurable via `MemoryOptions.port`)
- Listens on `127.0.0.1` only (not externally accessible)
- Auth disabled internally (`POWERMEM_SERVER_AUTH_ENABLED=false`)
- Uses Node.js 18+ built-in `fetch` (zero network dependencies)

### API endpoint mapping

| SDK method | HTTP | Endpoint |
|------------|------|----------|
| `add()` | POST | `/api/v1/memories` |
| `search()` | POST | `/api/v1/memories/search` |
| `get(id)` | GET | `/api/v1/memories/{id}` |
| `update(id)` | PUT | `/api/v1/memories/{id}` |
| `delete(id)` | DELETE | `/api/v1/memories/{id}` |
| `getAll()` | GET | `/api/v1/memories` |
| `addBatch()` | POST | `/api/v1/memories/batch` |
| `deleteAll()` | DELETE | `/api/v1/memories` |

### Field name convention

Python/HTTP uses `snake_case`, TypeScript uses `camelCase`. Bidirectional conversion happens in the `HttpProvider` layer:

| TypeScript | HTTP/Python |
|------------|-------------|
| `userId` | `user_id` |
| `agentId` | `agent_id` |
| `memoryId` | `memory_id` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

## 6. Process management

| Scenario | Behavior |
|----------|----------|
| `create()`: server already running | Reuse; `close()` does **not** kill it |
| `create()`: server not running | Spawn subprocess; `close()` kills it |
| Node.js process exits | Registered `process.on('exit')` ensures subprocess cleanup |
| Multiple Memory instances | Share a single `ServerManager` per port |

## 7. Error hierarchy

| Error class | Code | Trigger |
|-------------|------|---------|
| `PowerMemError` | (base) | Base class for all SDK errors |
| `PowerMemInitError` | `INIT_ERROR` | Python not found, venv creation failed, pip install failed |
| `PowerMemStartupError` | `STARTUP_ERROR` | Server did not become ready within timeout |
| `PowerMemConnectionError` | `CONNECTION_ERROR` | Cannot reach the server (network/fetch error) |
| `PowerMemAPIError` | `API_ERROR` | Server returned a non-success response |

## 8. Build output

Dual-format output via `tsup` (esbuild-based):

| File | Format | Purpose |
|------|--------|---------|
| `dist/index.js` | CommonJS | `require('powermem-ts')` |
| `dist/index.mjs` | ESM | `import from 'powermem-ts'` |
| `dist/index.d.ts` | TypeScript declarations | Type support |

## 9. Dependencies

**Runtime**: `dotenv` (`.env` loading). HTTP via Node.js built-in `fetch`, subprocess via built-in `child_process`.

**Dev**: `typescript`, `tsup`, `eslint`, `@types/node`.

## 10. Future evolution

| Phase | Change | User impact |
|-------|--------|-------------|
| Current | HttpProvider + auto-managed server | — |
| Mid-term | NativeProvider (partial native TS) | None — swap provider internally |
| Long-term | Full native TS, remove Python dependency | None — remove ServerManager |

The `MemoryProvider` interface ensures the transition is transparent. `Memory.create()` selects the provider internally; user-facing API remains unchanged.
