/**
 * Output formatting utilities for CLI.
 * Port of Python powermem/cli/utils/output.py.
 */

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function truncate(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function formatMemoryTable(memories: Array<Record<string, unknown>>): string {
  if (memories.length === 0) return '(no memories)';
  const header = `${'ID'.padEnd(22)} ${'User'.padEnd(14)} ${'Agent'.padEnd(14)} Content`;
  const sep = '-'.repeat(80);
  const rows = memories.map((m) => {
    const id = truncate(String(m.memoryId ?? m.id ?? ''), 20).padEnd(22);
    const user = truncate(String(m.userId ?? ''), 12).padEnd(14);
    const agent = truncate(String(m.agentId ?? ''), 12).padEnd(14);
    const content = truncate(String(m.content ?? ''), 30);
    return `${id} ${user} ${agent} ${content}`;
  });
  return [header, sep, ...rows].join('\n');
}

export function formatSearchTable(results: Array<Record<string, unknown>>): string {
  if (results.length === 0) return '(no results)';
  const header = `${'ID'.padEnd(22)} ${'Score'.padEnd(8)} Content`;
  const sep = '-'.repeat(70);
  const rows = results.map((r) => {
    const id = truncate(String(r.memoryId ?? ''), 20).padEnd(22);
    const score = (typeof r.score === 'number' ? r.score.toFixed(3) : '?').padEnd(8);
    const content = truncate(String(r.content ?? ''), 40);
    return `${id} ${score} ${content}`;
  });
  return [header, sep, ...rows].join('\n');
}

export function formatStats(stats: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Total memories: ${stats.totalMemories ?? stats.total_memories ?? 0}`);

  const byType = stats.byType ?? stats.by_type;
  if (byType && typeof byType === 'object') {
    lines.push('By type:');
    for (const [type, count] of Object.entries(byType as Record<string, number>)) {
      lines.push(`  ${type}: ${count}`);
    }
  }

  const ageDist = stats.ageDistribution ?? stats.age_distribution;
  if (ageDist && typeof ageDist === 'object') {
    lines.push('Age distribution:');
    for (const [range, count] of Object.entries(ageDist as Record<string, number>)) {
      lines.push(`  ${range}: ${count}`);
    }
  }

  const avgImp = stats.avgImportance ?? stats.avg_importance;
  if (avgImp != null) lines.push(`Avg importance: ${avgImp}`);

  return lines.join('\n');
}

export function printSuccess(msg: string): void {
  console.log(`\x1b[32m${msg}\x1b[0m`);
}

export function printError(msg: string): void {
  console.error(`\x1b[31m${msg}\x1b[0m`);
}

export function printWarning(msg: string): void {
  console.log(`\x1b[33m${msg}\x1b[0m`);
}

export function printInfo(msg: string): void {
  console.log(`\x1b[34m${msg}\x1b[0m`);
}
