import { z } from 'zod';
import { MAX_AMOUNT } from '../utils/money.js';

const entryKind = z.enum(['INCOME', 'EXPENSE'], {
  error: 'Тип операции должен быть INCOME или EXPENSE',
});

/**
 * Сумма строго положительная: направление задаёт kind, а не знак.
 *
 * Если разрешить минус, одна и та же операция станет представима двумя
 * способами (−500 EXPENSE и 500 EXPENSE), и любая агрегация начнёт врать.
 */
const amount = z
  .number({ error: 'Укажите сумму' })
  .positive('Сумма должна быть больше нуля')
  .max(MAX_AMOUNT, 'Сумма слишком велика');

const description = z
  .string()
  .trim()
  .max(200, 'Описание слишком длинное (максимум 200 символов)')
  .optional();

export const createTransactionSchema = z.object({
  accountId: z.uuid('Некорректный идентификатор счёта'),
  /**
   * null и undefined различаются намеренно: в PATCH null означает «убрать
   * категорию», а undefined — «не трогать». Здесь оба сводятся к «без категории».
   */
  categoryId: z.uuid('Некорректный идентификатор категории').nullish(),
  amount,
  kind: entryKind,
  description,
  /** Без даты считаем, что операция произошла сейчас. */
  occurredAt: z.coerce.date().optional(),
});

/**
 * Счёт в PATCH менять НЕ разрешаем.
 *
 * Перенос операции между счетами — это не правка поля, а пересчёт остатков
 * сразу на двух счетах. Делать его молча внутри «обновить описание» опасно;
 * правильный сценарий — удалить и создать заново, что и так доступно.
 */
export const updateTransactionSchema = z
  .object({
    categoryId: z.uuid('Некорректный идентификатор категории').nullish(),
    amount: amount.optional(),
    kind: entryKind.optional(),
    description,
    occurredAt: z.coerce.date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Укажите хотя бы одно поле для изменения');

/**
 * Фильтры ленты операций.
 *
 * limit ограничен сверху сотней: без потолка `?limit=1000000` выгружает всю
 * таблицу одним запросом — это и нагрузка, и способ выгрести чужой объём данных
 * из общей базы.
 */
export const listTransactionsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  accountId: z.uuid('Некорректный идентификатор счёта').optional(),
  categoryId: z.uuid('Некорректный идентификатор категории').optional(),
  kind: entryKind.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
