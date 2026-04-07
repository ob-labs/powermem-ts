/**
 * Prometheus-format metrics collector + Express middleware.
 * Mirrors Python powermem/src/server/utils/metrics.py.
 */
import type { Request, Response, NextFunction } from 'express';

interface CounterEntry {
  labels: Record<string, string>;
  value: number;
}

interface HistogramEntry {
  labels: Record<string, string>;
  sum: number;
  count: number;
  buckets: Map<number, number>;
}

const HISTOGRAM_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0];

function normalizeEndpoint(path: string): string {
  // Replace UUIDs and numeric IDs with {id}
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}')
    .replace(/\/\d{10,}/g, '/{id}');
}

function counterKey(labels: Record<string, string>): string {
  return Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
}

export class MetricsCollector {
  private readonly requestCounters = new Map<string, CounterEntry>();
  private readonly operationCounters = new Map<string, CounterEntry>();
  private readonly errorCounters = new Map<string, CounterEntry>();
  private readonly requestDuration = new Map<string, HistogramEntry>();

  recordRequest(method: string, endpoint: string, status: number, durationSec: number): void {
    const ep = normalizeEndpoint(endpoint);
    // Counter
    const labels = { method, endpoint: ep, status: String(status) };
    const key = counterKey(labels);
    const existing = this.requestCounters.get(key);
    if (existing) { existing.value++; } else { this.requestCounters.set(key, { labels, value: 1 }); }

    // Histogram
    const hLabels = { method, endpoint: ep };
    const hKey = counterKey(hLabels);
    let hist = this.requestDuration.get(hKey);
    if (!hist) {
      hist = { labels: hLabels, sum: 0, count: 0, buckets: new Map(HISTOGRAM_BUCKETS.map(b => [b, 0])) };
      this.requestDuration.set(hKey, hist);
    }
    hist.sum += durationSec;
    hist.count++;
    for (const b of HISTOGRAM_BUCKETS) {
      if (durationSec <= b) hist.buckets.set(b, (hist.buckets.get(b) ?? 0) + 1);
    }
  }

  recordOperation(operation: string, status: string): void {
    const labels = { operation, status };
    const key = counterKey(labels);
    const existing = this.operationCounters.get(key);
    if (existing) { existing.value++; } else { this.operationCounters.set(key, { labels, value: 1 }); }
  }

  recordError(errorType: string, endpoint: string): void {
    const ep = normalizeEndpoint(endpoint);
    const labels = { error_type: errorType, endpoint: ep };
    const key = counterKey(labels);
    const existing = this.errorCounters.get(key);
    if (existing) { existing.value++; } else { this.errorCounters.set(key, { labels, value: 1 }); }
  }

  toPrometheus(): string {
    const lines: string[] = [];

    // Request counter
    lines.push('# HELP powermem_api_requests_total Total API requests');
    lines.push('# TYPE powermem_api_requests_total counter');
    for (const entry of this.requestCounters.values()) {
      const l = Object.entries(entry.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`powermem_api_requests_total{${l}} ${entry.value}`);
    }

    // Operation counter
    lines.push('# HELP powermem_memory_operations_total Total memory operations');
    lines.push('# TYPE powermem_memory_operations_total counter');
    for (const entry of this.operationCounters.values()) {
      const l = Object.entries(entry.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`powermem_memory_operations_total{${l}} ${entry.value}`);
    }

    // Error counter
    lines.push('# HELP powermem_errors_total Total errors');
    lines.push('# TYPE powermem_errors_total counter');
    for (const entry of this.errorCounters.values()) {
      const l = Object.entries(entry.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`powermem_errors_total{${l}} ${entry.value}`);
    }

    // Duration histogram
    lines.push('# HELP powermem_api_request_duration_seconds Request duration in seconds');
    lines.push('# TYPE powermem_api_request_duration_seconds histogram');
    for (const hist of this.requestDuration.values()) {
      const l = Object.entries(hist.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      let cumulative = 0;
      for (const b of HISTOGRAM_BUCKETS) {
        cumulative += hist.buckets.get(b) ?? 0;
        const le = b < 0.1 ? b.toFixed(2) : b.toFixed(1);
        lines.push(`powermem_api_request_duration_seconds_bucket{${l},le="${le}"} ${cumulative}`);
      }
      lines.push(`powermem_api_request_duration_seconds_bucket{${l},le="+Inf"} ${hist.count}`);
      lines.push(`powermem_api_request_duration_seconds_sum{${l}} ${hist.sum.toFixed(6)}`);
      lines.push(`powermem_api_request_duration_seconds_count{${l}} ${hist.count}`);
    }

    return lines.join('\n') + '\n';
  }
}

/** Global singleton */
let _collector: MetricsCollector | undefined;
export function getMetricsCollector(): MetricsCollector {
  if (!_collector) _collector = new MetricsCollector();
  return _collector;
}

/** Express middleware that records request metrics. */
export function createMetricsMiddleware() {
  const collector = getMetricsCollector();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    const originalEnd = _res.end;

    (_res as any).end = function (this: Response, ...args: unknown[]) {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationSec = durationNs / 1e9;
      collector.recordRequest(req.method, req.path, _res.statusCode, durationSec);
      return (originalEnd as (...a: unknown[]) => unknown).apply(this, args);
    };

    next();
  };
}
