import { z } from 'zod';
import { hexColorSchema } from './common.schema.js';

const entryKind = z.enum(['INCOME', 'EXPENSE'], {
  error: 'Тип категории должен быть INCOME или EXPENSE',
});

const name = z
  .string({ error: 'Укажите название категории' })
  .trim()
  .min(1, 'Название не может быть пустым')
  .max(40, 'Название слишком длинное (максимум 40 символов)');

export const createCategorySchema = z.object({
  name,
  kind: entryKind.default('EXPENSE'),
  color: hexColorSchema.default('#8f8f8f'),
});

export const updateCategorySchema = z
  .object({
    name: name.optional(),
    kind: entryKind.optional(),
    color: hexColorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Укажите хотя бы одно поле для изменения');

/** Фильтр списка: ?kind=EXPENSE — чтобы не тащить доходные рубрики в разбивку трат. */
export const listCategoriesQuerySchema = z.object({
  kind: entryKind.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
