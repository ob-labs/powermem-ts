/**
 * Request logging middleware — JSON or text format.
 * Mirrors Python powermem/src/server/middleware/logging.py.
 */
import type { Request, Response, NextFunction } from 'express';

export interface LoggingConfig {
  /** Log level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'. Default: 'INFO'. */
  level?: string;
  /** Log format: 'json' | 'text'. Default: 'json'. */
  format?: string;
}

export function createLoggingMiddleware(config: LoggingConfig = {}) {
  const format = (config.format ?? process.env.POWERMEM_SERVER_LOG_FORMAT ?? 'json').toLowerCase();
  const level = (config.level ?? process.env.POWERMEM_SERVER_LOG_LEVEL ?? 'INFO').toUpperCase();
  const levelNum: Record<string, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };
  const minLevel = levelNum[level] ?? 20;

  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const originalEnd = res.end;

    (res as any).end = function (this: Response, ...args: unknown[]) {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const logLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO';

      if ((levelNum[logLevel] ?? 20) >= minLevel) {
        const entry = {
          timestamp: new Date().toISOString(),
          level: logLevel,
          method: req.method,
          path: req.path,
          status,
          duration_ms: duration,
          ip: req.ip ?? req.socket.remoteAddress,
          user_agent: req.headers['user-agent'],
        };

        if (format === 'json') {
          process.stdout.write(JSON.stringify(entry) + '\n');
        } else {
          process.stdout.write(
            `${entry.timestamp} ${logLevel} ${req.method} ${req.path} ${status} ${duration}ms\n`
          );
        }
      }

      return (originalEnd as (...a: unknown[]) => unknown).apply(this, args);
    };

    next();
  };
}
