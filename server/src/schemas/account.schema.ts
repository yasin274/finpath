import { z } from 'zod';
import { MAX_AMOUNT } from '../utils/money.js';

const accountType = z.enum(['CARD', 'CASH', 'SAVINGS'], {
  error: 'Тип счёта должен быть CARD, CASH или SAVINGS',
});

const name = z
  .string({ error: 'Укажите название счёта' })
  .trim()
  .min(1, 'Название не может быть пустым')
  .max(60, 'Название слишком длинное (максимум 60 символов)');

/**
 * Остаток может быть отрицательным — это нормальный кредитный лимит по карте,
 * а не ошибка ввода. Ограничиваем только по модулю, под размер колонки.
 */
const balance = z
  .number({ error: 'Остаток должен быть числом' })
  .min(-MAX_AMOUNT, 'Остаток слишком мал')
  .max(MAX_AMOUNT, 'Остаток слишком велик');

/**
 * Валюта — ровно три буквы ISO-4217 в верхнем регистре.
 * toUpperCase до проверки: «rub» с клавиатуры — обычное дело.
 */
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Код валюты — три латинские буквы, например RUB'));

export const createAccountSchema = z.object({
  name,
  type: accountType.default('CARD'),
  balance: balance.default(0),
  currency: currency.default('RUB'),
});

/**
 * В PATCH все поля необязательны, но пустое тело смысла не имеет —
 * иначе запрос молча ничего не делает и выглядит успешным.
 */
export const updateAccountSchema = z
  .object({
    name: name.optional(),
    type: accountType.optional(),
    balance: balance.optional(),
    currency: currency.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Укажите хотя бы одно поле для изменения');

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
