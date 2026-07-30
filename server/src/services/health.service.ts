import { checkDatabaseConnection } from '../config/prisma.js';
import { env } from '../config/env.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  uptimeSeconds: number;
  environment: string;
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
}

/**
 * Слой сервисов — здесь живёт логика и работа с БД. Про Express (req/res)
 * он не знает ничего, поэтому легко тестируется вне HTTP-контекста.
 */
export async function getHealthReport(): Promise<HealthReport> {
  const db = await checkDatabaseConnection();

  return {
    status: db.ok ? 'ok' : 'degraded',
    service: 'finpath-api',
    uptimeSeconds: Math.round(process.uptime()),
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: db.ok ? { connected: true } : { connected: false, error: db.error },
  };
}
