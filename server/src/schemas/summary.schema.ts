import { z } from 'zod';
import { periodSchema } from './common.schema.js';

/** GET /api/summary/overview — период необязателен, по умолчанию текущий месяц. */
export const overviewQuerySchema = periodSchema;

/**
 * GET /api/summary/by-category.
 *
 * По умолчанию EXPENSE: разбивка по категориям в интерфейсе — это «на что
 * уходят деньги». Доходы тоже можно запросить, но явным ?kind=INCOME.
 */
export const byCategoryQuerySchema = periodSchema.extend({
  kind: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  /** Сколько категорий показать; остальные схлопываются в «Прочее». */
  limit: z.coerce.number().int().min(1).max(20).default(4),
});

/**
 * GET /api/summary/cashflow — помесячный поток.
 *
 * Потолок в 60 месяцев отсекает случайный `?months=100000`: запрос строит
 * ровно столько строк, сколько попросили, и без границы это готовый способ
 * положить и сервер, и график на фронтенде.
 */
export const cashflowQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type ByCategoryQuery = z.infer<typeof byCategoryQuerySchema>;
export type CashflowQuery = z.infer<typeof cashflowQuerySchema>;
