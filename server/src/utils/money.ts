import { Prisma } from '../generated/prisma/client.js';

/**
 * Границы суммы одной операции.
 *
 * Верхняя взята из типа колонки: DECIMAL(14,2) вмещает 12 знаков до запятой.
 * Без явной проверки Postgres встретит переполнение уже внутри транзакции и
 * ответит невнятной ошибкой драйвера вместо понятного «сумма слишком большая».
 */
export const MAX_AMOUNT = 9_999_999_999.99;

/**
 * Деньги живут в БД как Decimal, а в JSON должны уезжать обычным числом.
 *
 * Prisma сериализует Decimal в строку, и фронтенд получал бы "1200.00" там,
 * где ждёт число: арифметика молча превращалась бы в конкатенацию, а
 * Intl.NumberFormat — в NaN. Поэтому конвертация ровно одна и в одном месте.
 *
 * Точность здесь не теряется: два знака после запятой в пределах 10^12
 * укладываются в диапазон безопасных целых double.
 */
export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

/** Округление до копеек для агрегатов, посчитанных в double (SUM в SQL). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
