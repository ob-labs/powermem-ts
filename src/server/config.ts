/**
 * Dashboard server configuration — reads from environment variables.
 * Mirrors Python powermem/src/server/config.py.
 */

function parseBool(val: string | undefined, def: boolean): boolean {
  if (val === undefined) return def;
  return ['1', 'true', 't', 'yes', 'y', 'on', 'enabled'].includes(val.toLowerCase());
}

export interface ServerConfig {
  host: string;
  port: number;
  authEnabled: boolean;
  apiKeys: string[];
  rateLimitEnabled: boolean;
  rateLimitPerMinute: number;
  corsEnabled: boolean;
  corsOrigins: string;
}

export function loadServerConfig(): ServerConfig {
  const apiKeysRaw = process.env.POWERMEM_SERVER_API_KEYS ?? '';
  return {
    host: process.env.POWERMEM_SERVER_HOST ?? '0.0.0.0',
    port: parseInt(process.env.POWERMEM_SERVER_PORT ?? process.env.PORT ?? '8000', 10),
    authEnabled: parseBool(process.env.POWERMEM_SERVER_AUTH_ENABLED, false),
    apiKeys: apiKeysRaw.split(',').map(k => k.trim()).filter(Boolean),
    rateLimitEnabled: parseBool(process.env.POWERMEM_SERVER_RATE_LIMIT_ENABLED, false),
    rateLimitPerMinute: parseInt(process.env.POWERMEM_SERVER_RATE_LIMIT_PER_MINUTE ?? '100', 10),
    corsEnabled: parseBool(process.env.POWERMEM_SERVER_CORS_ENABLED, true),
    corsOrigins: process.env.POWERMEM_SERVER_CORS_ORIGINS ?? '*',
  };
}
