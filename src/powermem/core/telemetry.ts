import type { TelemetryConfig } from '../configs.js';
import { getCurrentDatetimeIsoformat } from '../utils/payload-datetime.js';

function getConfigValue(
  config: Partial<TelemetryConfig> & Record<string, unknown>,
  keys: string[],
  defaultValue: unknown,
): unknown {
  for (const key of keys) {
    if (key in config && config[key] !== undefined) {
      return config[key];
    }
  }
  return defaultValue;
}

export interface TelemetryEvent {
  eventName: string;
  timestamp: string;
  properties?: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  version: string;
}

export class TelemetryManager {
  private events: TelemetryEvent[] = [];
  private readonly enabled: boolean;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly batchSize: number;
  private readonly flushInterval: number;

  constructor(config: Partial<TelemetryConfig> & Record<string, unknown> = {}) {
    this.enabled = Boolean(getConfigValue(config, ['enableTelemetry', 'enable_telemetry', 'enabled'], false));
    this.endpoint = String(getConfigValue(config, ['telemetryEndpoint', 'telemetry_endpoint', 'endpoint'], 'https://telemetry.powermem.ai'));
    const apiKey = getConfigValue(config, ['telemetryApiKey', 'telemetry_api_key', 'api_key'], undefined);
    this.apiKey = typeof apiKey === 'string' ? apiKey : undefined;
    this.batchSize = Number(getConfigValue(config, ['batchSize', 'telemetry_batch_size'], 100));
    this.flushInterval = Number(getConfigValue(config, ['flushInterval', 'telemetry_flush_interval'], 30));
  }

  captureEvent(
    eventName: string,
    properties?: Record<string, unknown>,
    userId?: string,
    agentId?: string,
  ): void {
    if (!this.enabled) return;
    this.events.push({
      eventName,
      properties,
      userId,
      agentId,
      timestamp: getCurrentDatetimeIsoformat(),
      version: '0.1.1',
    });
    if (this.events.length >= this.batchSize) {
      void this.flush();
    }
  }

  track(name: string, properties?: Record<string, unknown>): void {
    this.captureEvent(name, properties);
  }

  setUserProperties(userId: string, properties: Record<string, unknown>): void {
    this.captureEvent('user.properties', properties, userId);
  }

  async flush(): Promise<TelemetryEvent[]> {
    const flushed = this.events.splice(0);
    return flushed;
  }

  get pendingCount(): number {
    return this.events.length;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get config(): { endpoint: string; apiKey?: string; batchSize: number; flushInterval: number } {
    return {
      endpoint: this.endpoint,
      apiKey: this.apiKey,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
    };
  }
}
