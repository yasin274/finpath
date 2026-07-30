import type { Request, Response } from 'express';
import * as categoryService from '../services/category.service.js';
import { requireUser } from '../middlewares/auth.js';
import { validatedQuery } from '../middlewares/validate.js';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '../schemas/category.schema.js';

/** GET /api/categories?kind=EXPENSE */
export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const categories = await categoryService.listCategories(
    userId,
    validatedQuery<ListCategoriesQuery>(req),
  );

  res.status(200).json({ success: true, data: { categories, total: categories.length } });
}

/** POST /api/categories */
export async function create(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const category = await categoryService.createCategory(userId, req.body as CreateCategoryInput);

  res.status(201).json({ success: true, data: { category } });
}

/** PATCH /api/categories/:id */
export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const category = await categoryService.updateCategory(
    userId,
    String(req.params['id']),
    req.body as UpdateCategoryInput,
  );

  res.status(200).json({ success: true, data: { category } });
}

/** DELETE /api/categories/:id */
export async function remove(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const id = String(req.params['id']);
  const { transactionsUncategorized } = await categoryService.deleteCategory(userId, id);

  res.status(200).json({ success: true, data: { deleted: id, transactionsUncategorized } });
}
