/**
 * Memory CLI commands: pmem memory add|search|list|get|delete|delete-all
 */
import type { Command } from 'commander';

async function getMemory(program: Command) {
  const parent = program.opts();
  if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

  const { Memory } = await import('../../core/memory.js');
  return Memory.create();
}

export function registerMemoryCommands(program: Command): void {
  const memory = program
    .command('memory')
    .description('Memory CRUD operations');

  memory
    .command('add <content>')
    .description('Add a memory')
    .option('-u, --user-id <id>', 'User ID')
    .option('-a, --agent-id <id>', 'Agent ID')
    .option('-r, --run-id <id>', 'Run ID')
    .option('-m, --metadata <json>', 'Metadata as JSON string')
    .option('--memory-type <type>', 'Memory type (maps to category)')
    .option('--no-infer', 'Skip LLM fact extraction')
    .option('-s, --scope <scope>', 'Memory scope')
    .option('-c, --category <cat>', 'Memory category')
    .action(async (content: string, opts) => {
      const mem = await getMemory(program);
      try {
        let metadata: Record<string, unknown> | undefined;
        if (opts.metadata) {
          try {
            metadata = JSON.parse(opts.metadata);
          } catch {
            console.error('Invalid JSON for --metadata');
            process.exitCode = 1;
            return;
          }
        }
        const result = await mem.add(content, {
          userId: opts.userId,
          agentId: opts.agentId,
          runId: opts.runId,
          metadata,
          infer: opts.infer !== false,
          scope: opts.scope,
          category: opts.memoryType ?? opts.category,
        });
        if (program.opts().json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.message);
          for (const m of result.memories) {
            console.log(`  ${m.memoryId}: ${m.content}`);
          }
        }
      } finally {
        await mem.close();
      }
    });

  memory
    .command('search <query>')
    .description('Search memories')
    .option('-u, --user-id <id>', 'User ID')
    .option('-a, --agent-id <id>', 'Agent ID')
    .option('-r, --run-id <id>', 'Run ID')
    .option('-l, --limit <n>', 'Max results', '10')
    .option('-t, --threshold <n>', 'Min similarity score')
    .action(async (query: string, opts) => {
      const mem = await getMemory(program);
      try {
        const result = await mem.search(query, {
          userId: opts.userId,
          agentId: opts.agentId,
          runId: opts.runId,
          limit: parseInt(opts.limit, 10),
          threshold: opts.threshold ? parseFloat(opts.threshold) : undefined,
        });
        if (program.opts().json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Found ${result.total} results for "${query}":`);
          for (const r of result.results) {
            const score = r.score?.toFixed(3) ?? '?';
            console.log(`  [${score}] ${r.memoryId}: ${r.content}`);
          }
        }
      } finally {
        await mem.close();
      }
    });

  memory
    .command('list')
    .description('List all memories')
    .option('-u, --user-id <id>', 'User ID')
    .option('-a, --agent-id <id>', 'Agent ID')
    .option('-r, --run-id <id>', 'Run ID')
    .option('-l, --limit <n>', 'Max results', '20')
    .option('-o, --offset <n>', 'Offset', '0')
    .option('--sort <field>', 'Sort by field (created_at, updated_at)')
    .option('--order <dir>', 'Sort order (asc, desc)', 'desc')
    .action(async (opts) => {
      const mem = await getMemory(program);
      try {
        const result = await mem.getAll({
          userId: opts.userId,
          agentId: opts.agentId,
          runId: opts.runId,
          limit: parseInt(opts.limit, 10),
          offset: parseInt(opts.offset, 10),
          sortBy: opts.sort,
          order: opts.order as 'asc' | 'desc',
        });
        if (program.opts().json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Total: ${result.total} (showing ${result.memories.length})`);
          for (const m of result.memories) {
            console.log(`  ${m.memoryId}: ${m.content}`);
          }
        }
      } finally {
        await mem.close();
      }
    });

  memory
    .command('get <id>')
    .description('Get a memory by ID')
    .action(async (id: string) => {
      const mem = await getMemory(program);
      try {
        const result = await mem.get(id);
        if (program.opts().json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result) {
          console.log(`ID: ${result.memoryId}`);
          console.log(`Content: ${result.content}`);
          console.log(`Created: ${result.createdAt}`);
          console.log(`Updated: ${result.updatedAt}`);
          if (result.userId) console.log(`User: ${result.userId}`);
          if (result.agentId) console.log(`Agent: ${result.agentId}`);
        } else {
          console.log('Memory not found.');
        }
      } finally {
        await mem.close();
      }
    });

  memory
    .command('delete <id>')
    .description('Delete a memory by ID')
    .action(async (id: string) => {
      const mem = await getMemory(program);
      try {
        const ok = await mem.delete(id);
        console.log(ok ? 'Deleted.' : 'Not found.');
      } finally {
        await mem.close();
      }
    });

  memory
    .command('delete-all')
    .description('Delete all memories')
    .option('-u, --user-id <id>', 'User ID')
    .option('-a, --agent-id <id>', 'Agent ID')
    .option('-r, --run-id <id>', 'Run ID')
    .option('--confirm', 'Skip confirmation')
    .action(async (opts) => {
      if (!opts.confirm) {
        const target = opts.userId ? `user ${opts.userId}` : opts.agentId ? `agent ${opts.agentId}` : 'ALL';
        console.log(`This will delete memories for: ${target}`);
        console.log('Pass --confirm to proceed.');
        return;
      }
      const mem = await getMemory(program);
      try {
        await mem.deleteAll({ userId: opts.userId, agentId: opts.agentId, runId: opts.runId });
        console.log('Deleted.');
      } finally {
        await mem.close();
      }
    });
}
