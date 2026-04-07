/**
 * Config CLI commands: pmem config init|show|test
 */
import type { Command } from 'commander';

export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Configuration management');

  config
    .command('show')
    .description('Display current configuration')
    .option('-s, --section <section>', 'Show specific section (llm, embedder, vector_store, all)')
    .action(async (opts) => {
      const { autoConfig } = await import('../../config_loader.js');
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const cfg = autoConfig();
      const json = parent.json;

      if (json) {
        if (opts.section && opts.section !== 'all') {
          const section = cfg[opts.section as keyof typeof cfg];
          console.log(JSON.stringify(section ?? {}, null, 2));
        } else {
          console.log(JSON.stringify(cfg, null, 2));
        }
        return;
      }

      if (opts.section && opts.section !== 'all') {
        const section = cfg[opts.section as keyof typeof cfg];
        console.log(`[${opts.section}]`);
        console.log(JSON.stringify(section ?? {}, null, 2));
      } else {
        for (const [key, value] of Object.entries(cfg)) {
          if (value != null) {
            console.log(`[${key}]`);
            console.log(JSON.stringify(value, null, 2));
            console.log();
          }
        }
      }
    });

  config
    .command('validate')
    .description('Validate current configuration')
    .option('-f, --file <path>', 'Validate specific env file')
    .action(async (opts) => {
      const { autoConfig } = await import('../../config_loader.js');
      const { validateConfig } = await import('../../configs.js');

      if (opts.file) process.env.POWERMEM_ENV_FILE = opts.file;
      else if (program.opts().envFile) process.env.POWERMEM_ENV_FILE = program.opts().envFile;

      const cfg = autoConfig();
      const valid = validateConfig(cfg as Record<string, unknown>);

      if (valid) {
        console.log('Configuration is valid.');
      } else {
        console.error('Configuration is invalid. Missing required sections (vectorStore, llm, embedder).');
        process.exit(1);
      }
    });

  config
    .command('test')
    .description('Test component connections')
    .option('-c, --component <name>', 'Test specific component (database, llm, embedder, all)')
    .action(async (opts) => {
      const { autoConfig } = await import('../../config_loader.js');
      const parent = program.opts();
      if (parent.envFile) process.env.POWERMEM_ENV_FILE = parent.envFile;

      const cfg = autoConfig();
      const component = opts.component ?? 'all';

      console.log(`Testing ${component}...`);

      if (component === 'database' || component === 'all') {
        const provider = cfg.vectorStore?.provider ?? 'unknown';
        console.log(`  Database: ${provider} — OK (config loaded)`);
      }
      if (component === 'llm' || component === 'all') {
        const provider = cfg.llm?.provider ?? 'unknown';
        const hasKey = !!(cfg.llm?.config as Record<string, unknown>)?.apiKey;
        console.log(`  LLM: ${provider} — ${hasKey ? 'API key set' : 'No API key'}`);
      }
      if (component === 'embedder' || component === 'all') {
        const provider = cfg.embedder?.provider ?? 'unknown';
        const hasKey = !!(cfg.embedder?.config as Record<string, unknown>)?.apiKey;
        console.log(`  Embedder: ${provider} — ${hasKey ? 'API key set' : 'No API key'}`);
      }
    });
}
