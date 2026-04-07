/**
 * Memory statistics calculation.
 * Port of Python powermem/utils/stats.py.
 */

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  avgImportance: number;
  topAccessed: Array<{ id: string; content: string; accessCount: number }>;
  growthTrend: Record<string, number>;
  ageDistribution: Record<string, number>;
}

interface MemoryDict {
  id?: string;
  memoryId?: string;
  content?: string;
  memory?: string;
  category?: string;
  createdAt?: string;
  created_at?: string;
  accessCount?: number;
  access_count?: number;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export function calculateStatsFromMemories(memories: MemoryDict[]): MemoryStats {
  const total = memories.length;
  if (total === 0) {
    return {
      totalMemories: 0,
      byType: {},
      avgImportance: 0,
      topAccessed: [],
      growthTrend: {},
      ageDistribution: { '< 1 day': 0, '1-7 days': 0, '7-30 days': 0, '> 30 days': 0 },
    };
  }

  const byType: Record<string, number> = {};
  let totalImportance = 0;
  let importanceCount = 0;
  const accessList: Array<{ id: string; content: string; accessCount: number }> = [];
  const growthByDate: Record<string, number> = {};
  const ageDistribution: Record<string, number> = {
    '< 1 day': 0, '1-7 days': 0, '7-30 days': 0, '> 30 days': 0,
  };
  const now = Date.now();

  for (const m of memories) {
    // Category
    const meta = (typeof m.metadata === 'object' && m.metadata) ? m.metadata : {};
    const memType = m.category ?? (meta.category as string) ?? 'unknown';
    byType[memType] = (byType[memType] ?? 0) + 1;

    // Importance
    const importance = m.importance ?? (meta.importance as number | undefined);
    if (importance != null && importance > 0) {
      totalImportance += importance;
      importanceCount++;
    }

    // Access count
    const ac = m.accessCount ?? m.access_count ?? 0;
    accessList.push({
      id: m.id ?? m.memoryId ?? '',
      content: ((m.content ?? m.memory) ?? '').slice(0, 100),
      accessCount: typeof ac === 'number' ? ac : 0,
    });

    // Growth trend + age distribution
    const createdAt = m.createdAt ?? m.created_at;
    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        const dateKey = d.toISOString().split('T')[0];
        growthByDate[dateKey] = (growthByDate[dateKey] ?? 0) + 1;

        const ageDays = (now - d.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 1) ageDistribution['< 1 day']++;
        else if (ageDays < 7) ageDistribution['1-7 days']++;
        else if (ageDays < 30) ageDistribution['7-30 days']++;
        else ageDistribution['> 30 days']++;
      }
    }
  }

  accessList.sort((a, b) => b.accessCount - a.accessCount);

  return {
    totalMemories: total,
    byType,
    avgImportance: importanceCount > 0 ? Math.round((totalImportance / importanceCount) * 100) / 100 : 0,
    topAccessed: accessList.slice(0, 10),
    growthTrend: growthByDate,
    ageDistribution,
  };
}
