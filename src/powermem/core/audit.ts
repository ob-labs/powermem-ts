import fs from 'node:fs';
import path from 'node:path';
import type { AuditConfig } from '../configs.js';
import { getCurrentDatetimeIsoformat } from '../utils/payload-datetime.js';

function getConfigValue(
  config: Partial<AuditConfig> & Record<string, unknown>,
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

const LOG_LEVELS: Record<string, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export interface AuditEntry {
  timestamp: string;
  eventType: string;
  userId?: string;
  agentId?: string;
  details: Record<string, unknown>;
  version: string;
}

export class AuditLogger {
  private readonly enabled: boolean;
  private readonly logFile: string;
  private readonly minLevel: number;
  private readonly retentionDays: number;
  private fd: number | undefined;

  constructor(config: Partial<AuditConfig> & Record<string, unknown> = {}) {
    this.enabled = Boolean(getConfigValue(config, ['enabled', 'enable_audit'], true));
    this.logFile = String(getConfigValue(config, ['logFile', 'log_file', 'audit_log_file'], 'audit.log'));
    const rawLevel = String(getConfigValue(config, ['logLevel', 'log_level', 'audit_log_level'], 'INFO')).toUpperCase();
    this.minLevel = LOG_LEVELS[rawLevel] ?? LOG_LEVELS.INFO;
    this.retentionDays = Number(getConfigValue(config, ['retentionDays', 'retention_days', 'audit_retention_days'], 90));
  }

  logEvent(
    eventType: string,
    details: Record<string, unknown>,
    userId?: string,
    agentId?: string,
    level = 'INFO',
  ): void {
    if (!this.enabled) return;
    const numLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    if (numLevel < this.minLevel) return;

    const entry: AuditEntry = {
      timestamp: getCurrentDatetimeIsoformat(),
      eventType,
      userId,
      agentId,
      details,
      version: '0.1.1',
    };

    try {
      if (this.fd === undefined) {
        const dir = path.dirname(this.logFile);
        if (dir && dir !== '.') {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.fd = fs.openSync(this.logFile, 'a');
      }
      fs.writeSync(this.fd, `${JSON.stringify(entry)}\n`);
    } catch {
      // Audit logging must never break the caller.
    }
  }

  log(action: string, details: Record<string, unknown>, level = 'INFO'): void {
    this.logEvent(action, details, undefined, undefined, level);
  }

  logAccess(
    resourceType: string,
    resourceId: string,
    action: string,
    userId?: string,
    agentId?: string,
    success = true,
  ): void {
    this.logEvent(
      'access',
      { resourceType, resourceId, action, success },
      userId,
      agentId,
    );
  }

  logSecurityEvent(
    eventType: string,
    severity: string,
    details: Record<string, unknown>,
    userId?: string,
    agentId?: string,
  ): void {
    this.logEvent(
      'security',
      { eventType, severity, ...details },
      userId,
      agentId,
      severity.toUpperCase(),
    );
  }

  cleanupOldLogs(): void {
    if (!this.enabled || !fs.existsSync(this.logFile)) return;
    try {
      const stat = fs.statSync(this.logFile);
      const cutoffMs = this.retentionDays * 24 * 60 * 60 * 1000;
      if (Date.now() - stat.mtimeMs > cutoffMs) {
        fs.rmSync(this.logFile, { force: true });
        this.fd = undefined;
      }
    } catch {
      // Ignore cleanup failures.
    }
  }

  close(): void {
    if (this.fd !== undefined) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // Ignore close errors.
      }
      this.fd = undefined;
    }
  }
}
