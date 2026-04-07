/**
 * Stats CLI command: pmem stats
 */
import type { Command } from 'commander';
import { calculateStatsFromMemories } from '../../utils/stats.js';
import { formatJson, formatStats } from '../utils/output.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Display memory statistics')
    .option('-u, --user-id <id>', 'Filter by user ID')
    .option('-a, --agent-id <id>', 'Filter by agent ID')
    .action(async (opts) => {
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const { Memory } = await import('../../core/memory.js');
      const mem = await Memory.create();

      try {
        const all = await mem.getAll({
          userId: opts.userId,
          agentId: opts.agentId,
          limit: 10000,
        });

        const stats = calculateStatsFromMemories(
          all.memories as unknown as Array<Record<string, unknown>>
        );

        if (parent.json) {
          console.log(formatJson(stats));
        } else {
          console.log(formatStats(stats as unknown as Record<string, unknown>));
        }
      } finally {
        await mem.close();
      }
    });
}
