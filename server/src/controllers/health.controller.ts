import type { Request, Response } from 'express';
import { getHealthReport } from '../services/health.service.js';

/** GET /api/health */
export async function health(_req: Request, res: Response): Promise<void> {
  const report = await getHealthReport();

  // 503, если БД недоступна, — чтобы мониторинг видел проблему, а не считал
  // инстанс живым только потому, что процесс отвечает.
  res.status(report.status === 'ok' ? 200 : 503).json({
    success: report.status === 'ok',
    data: report,
  });
}
