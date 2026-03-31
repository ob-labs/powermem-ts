# PowerMem TypeScript SDK

**TypeScript SDK for [PowerMem](https://github.com/oceanbase/powermem) — persistent memory for AI agents and applications.**

[![npm version](https://img.shields.io/npm/v/powermem-ts)](https://www.npmjs.com/package/powermem-ts)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

PowerMem combines vector, full-text, and graph retrieval with LLM-driven memory extraction and Ebbinghaus-style time decay. This package provides a TypeScript/Node.js SDK that manages the Python-based PowerMem server automatically — zero manual setup required.

## Features

- **Zero-config server management** — automatically installs Python environment, creates virtualenv, and starts `powermem-server` as a subprocess
- **Direct connect mode** — connect to an existing PowerMem server without spawning a subprocess
- **Full API coverage** — add, search, get, update, delete, batch add, and more
- **Type-safe** — complete TypeScript type definitions with strict mode
- **Dual format** — ships both ESM and CommonJS builds

## Quick start

### Install

```bash
npm install powermem-ts
```

### Configure

Copy `.env.example` to `.env` and fill in your LLM and Embedding API keys:

```bash
cp .env.example .env
```

Required fields in `.env`:

```env
# Database (default: embedded OceanBase via SeekDB, no extra setup needed)
DATABASE_PROVIDER=oceanbase
OCEANBASE_HOST=
OCEANBASE_PATH=./seekdb_data

# LLM (required)
LLM_PROVIDER=qwen
LLM_API_KEY=your_api_key_here
LLM_MODEL=qwen-plus

# Embedding (required)
EMBEDDING_PROVIDER=qwen
EMBEDDING_API_KEY=your_api_key_here
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMS=1536
```

See [.env.example](.env.example) for all available options. Supported LLM providers: `qwen`, `openai`, `siliconflow`, `ollama`, `vllm`, `anthropic`, `deepseek`. Supported embedding providers: `qwen`, `openai`, `siliconflow`, `huggingface`, `ollama`.

### Prerequisites

- **Node.js** >= 18.0.0
- **Python** >= 3.11 (used internally to run the PowerMem server)

### Usage

```typescript
import { Memory } from 'powermem-ts';

// One-time init: installs Python env + powermem package (idempotent)
await Memory.init();

// Or specify a version:
// await Memory.init({ powermemVersion: 'powermem==1.0.0' });

// Create instance (auto-starts the server)
const memory = await Memory.create();

// Add a memory
const result = await memory.add('User likes coffee', { userId: 'user123' });
console.log('Added:', result.memories);

// Semantic search
const hits = await memory.search('user preferences', { userId: 'user123', limit: 5 });
console.log('Results:', hits.results);

// List all memories
const all = await memory.getAll({ userId: 'user123' });
console.log('Total:', all.total);

// Clean up (stops the server subprocess)
await memory.close();
```

### Connect to an existing server

If you already have a PowerMem server running (e.g. via `powermem-server` or Docker), skip the auto-start and connect directly:

```typescript
import { Memory } from 'powermem-ts';

const memory = await Memory.create({
  serverUrl: 'http://127.0.0.1:19527',
  apiKey: process.env.POWERMEM_API_KEY,  // optional
});

await memory.add('Direct connect mode test');
await memory.close();
```

## API

### `Memory.init(options?)`

One-time setup. Creates a Python virtualenv at `~/.powermem/venv/` and installs the `powermem` package. Idempotent — skips if already installed.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `homeDir` | `string` | `~/.powermem/` | PowerMem home directory |
| `pythonPath` | `string` | `python3` / `python` | Path to Python 3.11+ |
| `powermemVersion` | `string` | `powermem` | pip package specifier |
| `pipArgs` | `string[]` | `[]` | Extra arguments for `pip install` |
| `verbose` | `boolean` | `true` | Print progress logs |

### `Memory.create(options?)`

Creates a `Memory` instance. Automatically starts the server if no `serverUrl` is provided.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverUrl` | `string` | — | Connect to existing server (skips auto-start) |
| `apiKey` | `string` | — | API key for authentication |
| `envFile` | `string` | `.env` | Path to `.env` file |
| `port` | `number` | `19527` | Server port |
| `startupTimeout` | `number` | `30000` | Max wait time (ms) for server startup |
| `init` | `InitOptions` | — | Options passed to `Memory.init()` |

### Instance methods

| Method | Description |
|--------|-------------|
| `add(content, options?)` | Add a memory. Options: `userId`, `agentId`, `runId`, `metadata`, `filters`, `infer` |
| `search(query, options?)` | Semantic search. Options: `userId`, `agentId`, `runId`, `filters`, `limit` |
| `get(memoryId)` | Get a single memory by ID. Returns `null` if not found |
| `update(memoryId, content, options?)` | Update memory content and/or metadata |
| `delete(memoryId)` | Delete a single memory |
| `getAll(options?)` | List memories. Options: `userId`, `agentId`, `limit`, `offset` |
| `addBatch(memories, options?)` | Batch add multiple memories |
| `deleteAll(options?)` | Delete all memories matching filter |
| `reset()` | Delete all memories |
| `close()` | Close the connection and stop the server subprocess |

## Docs

- [Architecture](docs/architecture.md) — design, project structure, flows, and error handling

## Related

- [PowerMem](https://github.com/oceanbase/powermem) — the core Python project (SDK, CLI, HTTP API, MCP Server)
- [PowerMem Documentation](https://github.com/oceanbase/powermem/tree/main/docs) — architecture, configuration, and guides

## License

Apache License 2.0 — see [LICENSE](LICENSE).
