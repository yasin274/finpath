import { z } from 'zod';

/** Идентификатор ресурса в пути: /api/accounts/:id */
export const idParamSchema = z.object({
  id: z.uuid('Некорректный идентификатор'),
});

/**
 * HEX-цвет для легенды диаграмм.
 *
 * Значение уходит прямо в атрибут style на фронтенде, поэтому формат проверяем
 * строго: произвольная строка здесь — это дыра для инъекции CSS.
 */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Цвет должен быть в формате #RGB, #RRGGBB или #RRGGBBAA');

/**
 * Границы отчётного периода. Обе даты необязательны: без них сервис берёт
 * период по умолчанию (текущий месяц или последние 12 месяцев).
 *
 * z.coerce.date() принимает и '2026-03-01', и полный ISO с временем —
 * фронтенду не приходится приводить формат.
 */
export const periodSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PeriodQuery = z.infer<typeof periodSchema>;

/**
 * Приводит период к конкретным датам.
 *
 * Верхнюю границу сдвигаем на конец суток, потому что '2026-03-31' парсится
 * в полночь: без сдвига последний день месяца молча выпадал бы из отчёта —
 * ошибка, которую в сводках замечают далеко не сразу.
 */
export function resolvePeriod(period: PeriodQuery, fallbackDays = 30): { from: Date; to: Date } {
  const to = period.to ? endOfDay(period.to) : endOfDay(new Date());
  const from = period.from ?? new Date(to.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  return { from: startOfDay(from), to };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  // Если во входной дате уже было время, конец суток его не «откатывает»:
  // 23:59:59.999 всегда позже любого момента этого же дня.
  copy.setHours(23, 59, 59, 999);
  return copy;
}
