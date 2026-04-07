/**
 * Advanced filter parser.
 * Port of Python powermem/utils/filter_parser.py.
 *
 * Transforms user-friendly filter keys into storage-compatible format:
 * - start_time/end_time → created_at range
 * - tags (array) → $in operator
 * - type → category mapping
 * - importance (number) → $gte operator
 */

export function parseAdvancedFilters(
  filters?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!filters || Object.keys(filters).length === 0) return undefined;

  const parsed = { ...filters };

  // 1. Time range → created_at
  if ('start_time' in parsed || 'end_time' in parsed) {
    const createdAt: Record<string, unknown> =
      typeof parsed.created_at === 'object' && parsed.created_at !== null
        ? { ...(parsed.created_at as Record<string, unknown>) }
        : {};

    if ('start_time' in parsed) {
      createdAt.$gte = parsed.start_time;
      delete parsed.start_time;
    }
    if ('end_time' in parsed) {
      createdAt.$lte = parsed.end_time;
      delete parsed.end_time;
    }
    parsed.created_at = createdAt;
  }

  // 2. Tags → $in
  if ('tags' in parsed) {
    const tags = parsed.tags;
    delete parsed.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      parsed.tags = { $in: tags };
    } else if (tags) {
      parsed.tags = tags;
    }
  }

  // 3. type → category
  if ('type' in parsed) {
    parsed.category = parsed.type;
    delete parsed.type;
  }

  // 4. importance → $gte
  if ('importance' in parsed) {
    const importance = parsed.importance;
    delete parsed.importance;
    if (typeof importance === 'number') {
      parsed.importance = { $gte: importance };
    }
  }

  return parsed;
}
