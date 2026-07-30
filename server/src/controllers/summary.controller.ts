import type { Request, Response } from 'express';
import * as summaryService from '../services/summary.service.js';
import { requireUser } from '../middlewares/auth.js';
import { validatedQuery } from '../middlewares/validate.js';
import type { ByCategoryQuery, CashflowQuery, OverviewQuery } from '../schemas/summary.schema.js';

/** GET /api/summary/overview?from=&to= */
export async function overview(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const data = await summaryService.getOverview(userId, validatedQuery<OverviewQuery>(req));

  res.status(200).json({ success: true, data });
}

/** GET /api/summary/by-category?from=&to=&kind=EXPENSE&limit=4 */
export async function byCategory(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const data = await summaryService.getByCategory(userId, validatedQuery<ByCategoryQuery>(req));

  res.status(200).json({ success: true, data });
}

/** GET /api/summary/cashflow?months=12 */
export async function cashflow(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const data = await summaryService.getCashflow(userId, validatedQuery<CashflowQuery>(req));

  res.status(200).json({ success: true, data });
}
