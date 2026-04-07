/**
 * Import/export utilities.
 * Port of Python powermem/utils/io.py.
 */

export function exportToJson(records: Record<string, unknown>[]): string {
  return JSON.stringify(records, null, 2);
}

export function importFromJson(json: string): Record<string, unknown>[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  return parsed;
}

export function exportToCsv(
  records: Record<string, unknown>[],
  columns?: string[]
): string {
  if (records.length === 0) return '';
  const cols = columns ?? Object.keys(records[0]);
  const header = cols.join(',');
  const rows = records.map((r) =>
    cols.map((c) => {
      const val = r[c];
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}
