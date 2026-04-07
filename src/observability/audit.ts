/**
 * Audit logger — file-based audit trail for memory operations.
 * Runtime implementation of the AuditConfig Zod schema from configs.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AuditConfig } from '../configs.js';

const LOG_LEVELS: Record<string, number> = {
  DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50,
};

export interface AuditEntry {
  timestamp: string;
  action: string;
  level: string;
  details: Record<string, unknown>;
}

export class AuditLogger {
  private readonly enabled: boolean;
  private readonly logFile: string;
  private readonly minLevel: number;
  private fd: number | undefined;

  constructor(config: Partial<AuditConfig> = {}) {
    this.enabled = config.enabled ?? false;
    this.logFile = config.logFile ?? './logs/audit.log';
    this.minLevel = LOG_LEVELS[(config.logLevel ?? 'INFO').toUpperCase()] ?? 20;
  }

  /** Log an audit event. Level defaults to INFO. */
  log(action: string, details: Record<string, unknown>, level = 'INFO'): void {
    if (!this.enabled) return;
    const numLevel = LOG_LEVELS[level.toUpperCase()] ?? 20;
    if (numLevel < this.minLevel) return;

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      level,
      details,
    };

    try {
      if (this.fd === undefined) {
        const dir = path.dirname(this.logFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        this.fd = fs.openSync(this.logFile, 'a');
      }
      fs.writeSync(this.fd, JSON.stringify(entry) + '\n');
    } catch {
      // Audit logging should never break the main flow
    }
  }

  /** Close the log file handle. */
  close(): void {
    if (this.fd !== undefined) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = undefined;
    }
  }
}
