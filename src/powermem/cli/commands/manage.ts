/**
 * Manage CLI commands: pmem manage backup|restore|cleanup
 */
import type { Command } from 'commander';
import fs from 'node:fs';
import { formatJson } from '../utils/output.js';

export function registerManageCommands(program: Command): void {
  const manage = program
    .command('manage')
    .description('Backup, restore, and cleanup operations');

  manage
    .command('backup')
    .description('Backup memories to a JSON file')
    .option('-o, --output <file>', 'Output file path')
    .option('-u, --user-id <id>', 'Filter by user ID')
    .option('-a, --agent-id <id>', 'Filter by agent ID')
    .option('-l, --limit <n>', 'Max memories to backup', '10000')
    .action(async (opts) => {
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const { Memory } = await import('../../core/memory.js');
      const mem = await Memory.create();

      try {
        const result = await mem.getAll({
          userId: opts.userId,
          agentId: opts.agentId,
          limit: parseInt(opts.limit, 10),
        });

        const backup = {
          version: '1.0',
          createdAt: new Date().toISOString(),
          filters: { userId: opts.userId, agentId: opts.agentId },
          count: result.memories.length,
          memories: result.memories,
        };

        const outputPath = opts.output ??
          `powermem_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;

        fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));

        if (parent.json) {
          console.log(formatJson({ path: outputPath, count: backup.count }));
        } else {
          console.log(`Backed up ${backup.count} memories to ${outputPath}`);
        }
      } finally {
        await mem.close();
      }
    });

  manage
    .command('restore')
    .description('Restore memories from a JSON backup')
    .argument('<file>', 'Backup file path')
    .option('-u, --user-id <id>', 'Override user ID')
    .option('--dry-run', 'Preview without restoring')
    .action(async (file: string, opts) => {
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      const backup = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const memories = backup.memories ?? [];
      console.log(`Found ${memories.length} memories in backup (v${backup.version ?? '?'})`);

      if (opts.dryRun) {
        console.log('Dry run — no changes made.');
        return;
      }

      const { Memory } = await import('../../core/memory.js');
      const mem = await Memory.create();

      let success = 0;
      let errors = 0;

      try {
        for (const m of memories) {
          try {
            await mem.add(m.content, {
              userId: opts.userId ?? m.userId,
              agentId: m.agentId,
              metadata: m.metadata,
              infer: false,
            });
            success++;
          } catch {
            errors++;
          }
        }

        if (parent.json) {
          console.log(formatJson({ restored: success, errors }));
        } else {
          console.log(`Restored ${success} memories (${errors} errors)`);
        }
      } finally {
        await mem.close();
      }
    });

  manage
    .command('cleanup')
    .description('Remove low-quality or duplicate memories')
    .option('-u, --user-id <id>', 'Filter by user ID')
    .option('-s, --strategy <type>', 'Dedup strategy: exact or semantic', 'exact')
    .option('-t, --threshold <n>', 'Similarity threshold for semantic dedup', '0.95')
    .option('--dry-run', 'Preview without deleting')
    .action(async (opts) => {
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const { Memory } = await import('../../core/memory.js');
      const { loadConfigFromEnv } = await import('../../config_loader.js');
      const { MemoryOptimizer } = await import('../../intelligence/memory-optimizer.js');
      const { SQLiteStore } = await import('../../storage/sqlite/sqlite.js');

      // Create store directly for optimizer
      const mem = await Memory.create();
      const config = loadConfigFromEnv();
      const sqlitePath = typeof config.vectorStore?.config?.path === 'string'
        ? config.vectorStore.config.path
        : './data/powermem_dev.db';
      const store = new SQLiteStore(sqlitePath);

      try {
        const optimizer = new MemoryOptimizer(store);

        if (opts.dryRun) {
          const count = await mem.count({ userId: opts.userId });
          console.log(`Would check ${count} memories with strategy: ${opts.strategy}`);
          return;
        }

        const result = await optimizer.deduplicate(
          opts.strategy as 'exact' | 'semantic',
          opts.userId,
          parseFloat(opts.threshold)
        );

        if (parent.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Checked: ${result.totalChecked}`);
          console.log(`Duplicates found: ${result.duplicatesFound}`);
          console.log(`Deleted: ${result.deletedCount}`);
          if (result.errors > 0) console.log(`Errors: ${result.errors}`);
        }
      } finally {
        await mem.close();
        await store.close();
      }
    });
}
