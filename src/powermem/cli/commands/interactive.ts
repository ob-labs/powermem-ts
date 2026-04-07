/**
 * Interactive REPL: pmem shell
 * Port of Python powermem/cli/commands/interactive.py.
 */
import type { Command } from 'commander';
import readline from 'node:readline';

export function registerShellCommand(program: Command): void {
  program
    .command('shell')
    .description('Interactive PowerMem shell (REPL)')
    .action(async () => {
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const { Memory } = await import('../../core/memory.js');
      let mem: Awaited<ReturnType<typeof Memory.create>>;

      try {
        mem = await Memory.create();
      } catch (err) {
        console.error(`Failed to initialize: ${err}`);
        process.exit(1);
      }

      let defaultUserId: string | undefined;
      let defaultAgentId: string | undefined;
      let jsonOutput = parent.json ?? false;

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'powermem> ',
        completer: (line: string) => {
          const cmds = ['add', 'search', 'get', 'list', 'delete', 'stats', 'set', 'show', 'help', 'exit'];
          const hits = cmds.filter((c) => c.startsWith(line));
          return [hits.length ? hits : cmds, line];
        },
      });

      console.log('PowerMem Interactive Shell. Type "help" for commands, "exit" to quit.');
      rl.prompt();

      rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) { rl.prompt(); return; }

        const [cmd, ...args] = trimmed.split(/\s+/);
        const rest = args.join(' ');

        try {
          switch (cmd) {
            case 'add': {
              if (!rest) { console.log('Usage: add <content>'); break; }
              const result = await mem.add(rest, { userId: defaultUserId, agentId: defaultAgentId, infer: true });
              if (jsonOutput) console.log(JSON.stringify(result, null, 2));
              else {
                console.log(result.message);
                for (const m of result.memories) console.log(`  ${m.memoryId}: ${m.content}`);
              }
              break;
            }
            case 'search': {
              if (!rest) { console.log('Usage: search <query>'); break; }
              const result = await mem.search(rest, { userId: defaultUserId, agentId: defaultAgentId, limit: 5 });
              if (jsonOutput) console.log(JSON.stringify(result, null, 2));
              else {
                console.log(`Found ${result.total} results:`);
                for (const r of result.results) {
                  console.log(`  [${r.score?.toFixed(3) ?? '?'}] ${r.memoryId}: ${r.content}`);
                }
              }
              break;
            }
            case 'get': {
              if (!rest) { console.log('Usage: get <id>'); break; }
              const m = await mem.get(rest);
              if (jsonOutput) console.log(JSON.stringify(m, null, 2));
              else if (m) console.log(`${m.memoryId}: ${m.content} (created: ${m.createdAt})`);
              else console.log('Not found.');
              break;
            }
            case 'list': {
              const limit = rest ? parseInt(rest, 10) || 10 : 10;
              const result = await mem.getAll({ userId: defaultUserId, agentId: defaultAgentId, limit });
              if (jsonOutput) console.log(JSON.stringify(result, null, 2));
              else {
                console.log(`Total: ${result.total} (showing ${result.memories.length})`);
                for (const m of result.memories) console.log(`  ${m.memoryId}: ${m.content}`);
              }
              break;
            }
            case 'delete': {
              if (!rest) { console.log('Usage: delete <id>'); break; }
              const ok = await mem.delete(rest);
              console.log(ok ? 'Deleted.' : 'Not found.');
              break;
            }
            case 'stats': {
              const { calculateStatsFromMemories } = await import('../../utils/stats.js');
              const all = await mem.getAll({ userId: defaultUserId, limit: 10000 });
              const stats = calculateStatsFromMemories(all.memories as unknown as Array<Record<string, unknown>>);
              if (jsonOutput) console.log(JSON.stringify(stats, null, 2));
              else {
                console.log(`Total: ${stats.totalMemories}`);
                for (const [t, c] of Object.entries(stats.byType)) console.log(`  ${t}: ${c}`);
              }
              break;
            }
            case 'set': {
              const [key, val] = rest.split(/\s+/, 2);
              if (key === 'user') { defaultUserId = val || undefined; console.log(`User ID: ${defaultUserId ?? '(none)'}`); }
              else if (key === 'agent') { defaultAgentId = val || undefined; console.log(`Agent ID: ${defaultAgentId ?? '(none)'}`); }
              else if (key === 'json') { jsonOutput = val !== 'false' && val !== '0'; console.log(`JSON output: ${jsonOutput}`); }
              else console.log('Usage: set user|agent|json <value>');
              break;
            }
            case 'show': {
              console.log(`User ID: ${defaultUserId ?? '(none)'}`);
              console.log(`Agent ID: ${defaultAgentId ?? '(none)'}`);
              console.log(`JSON output: ${jsonOutput}`);
              break;
            }
            case 'help': {
              console.log('Commands: add, search, get, list, delete, stats, set, show, help, exit');
              console.log('  set user <id>   — Set default user ID');
              console.log('  set agent <id>  — Set default agent ID');
              console.log('  set json true   — Enable JSON output');
              break;
            }
            case 'exit': case 'quit': case 'q': {
              rl.close();
              return;
            }
            default:
              console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
          }
        } catch (err) {
          console.error(`Error: ${err}`);
        }

        rl.prompt();
      });

      rl.on('close', async () => {
        await mem.close();
        console.log('Bye!');
      });
    });
}
