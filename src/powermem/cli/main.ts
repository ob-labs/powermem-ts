#!/usr/bin/env node
/**
 * PowerMem CLI — main entry point.
 * Port of Python powermem/cli/main.py using Commander.js.
 */
import { Command } from 'commander';
import { VERSION } from '../version.js';
import { registerConfigCommands } from './commands/config.js';
import { registerMemoryCommands } from './commands/memory.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerManageCommands } from './commands/manage.js';
import { registerShellCommand } from './commands/interactive.js';

const program = new Command();

program
  .name('pmem')
  .description('PowerMem CLI — Command Line Interface for PowerMem')
  .version(VERSION)
  .option('-f, --env-file <path>', 'Load settings from this .env file')
  .option('-j, --json', 'Output results in JSON format')
  .option('-v, --verbose', 'Enable verbose output');

registerConfigCommands(program);
registerMemoryCommands(program);
registerStatsCommand(program);
registerManageCommands(program);
registerShellCommand(program);

program.parse();
