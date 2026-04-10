# PowerMem TypeScript SDK

TypeScript version of [PowerMem](https://github.com/oceanbase/powermem), powered by [SeekDB](https://github.com/oceanbase/seekdb-js).

[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Install

```bash
npm install powermem
```

## Configuration

Create a `.env` file in your project root:

```env
# Embedding
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# SeekDB (optional, defaults shown)
SEEKDB_PATH=./seekdb_data
SEEKDB_DATABASE=test
SEEKDB_COLLECTION=power_mem
SEEKDB_DISTANCE=l2
SEEKDB_DIMENSION=1536
```

## Usage

```typescript
import { Memory } from 'powermem';

const memory = await Memory.create(); // auto-loads .env

// Add
await memory.add('User likes coffee', { userId: 'user1' });

// Search
const results = await memory.search('preferences', { userId: 'user1' });
console.log(results.results);

// Update
await memory.update('<memory-id>', 'User prefers espresso');

// Delete
await memory.delete('<memory-id>');

// Close
await memory.close();
```

## API Reference

| Method | Description |
|--------|-------------|
| `Memory.create(options?)` | Create instance (auto-config from .env) |
| `add(content, options?)` | Add memory |
| `search(query, options?)` | Semantic search |
| `get(id)` | Get by ID |
| `update(id, content)` | Update content |
| `delete(id)` | Delete by ID |
| `getAll(options?)` | List with pagination, sorting, filtering |
| `count(options?)` | Count with optional filters |
| `addBatch(items, options?)` | Batch add |
| `deleteAll(options?)` | Bulk delete |
| `reset()` | Clear all |
| `close()` | Release resources |

## Related

- [PowerMem](https://github.com/oceanbase/powermem) — Original Python implementation
- [SeekDB](https://github.com/oceanbase/seekdb-js) — OceanBase embedded vector database

## License

Apache License 2.0
