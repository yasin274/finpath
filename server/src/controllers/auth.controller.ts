import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { requireUser } from '../middlewares/auth.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';

/**
 * Слой контроллеров — только HTTP: разобрать запрос, дёрнуть сервис, отдать
 * ответ. Тело уже провалидировано middleware validate(), поэтому здесь его
 * можно безопасно приводить к типу схемы.
 */

/** POST /api/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);

  // 201 Created — создан новый ресурс.
  res.status(201).json({ success: true, data: result });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);

  res.status(200).json({ success: true, data: result });
}

/** GET /api/auth/me — данные текущего пользователя. */
export async function me(req: Request, res: Response): Promise<void> {
  const { id } = requireUser(req);
  const user = await authService.getUserById(id);

  res.status(200).json({ success: true, data: { user } });
}
