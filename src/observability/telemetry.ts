/**
 * Telemetry collector — minimal event tracking.
 * Runtime implementation of the TelemetryConfig Zod schema from configs.ts.
 */
import type { TelemetryConfig } from '../configs.js';

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  properties?: Record<string, unknown>;
}

export class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private readonly enabled: boolean;
  private readonly batchSize: number;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.enabled = config.enableTelemetry ?? false;
    this.batchSize = config.batchSize ?? 100;
  }

  /** Track an event. Noop if telemetry is disabled. */
  track(name: string, properties?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      properties,
    });
    if (this.events.length >= this.batchSize) {
      void this.flush();
    }
  }

  /** Flush collected events. Currently logs to console; HTTP posting is future work. */
  async flush(): Promise<TelemetryEvent[]> {
    const flushed = this.events.splice(0);
    return flushed;
  }

  /** Get number of pending events. */
  get pendingCount(): number {
    return this.events.length;
  }
}
