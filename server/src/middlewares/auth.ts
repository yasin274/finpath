import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Расширяем тип Request, чтобы `req.user` был типизирован во всём приложении.
 *
 * Поле опциональное: на публичных роутах (регистрация, логин) его нет.
 * Как следствие, в защищённых контроллерах TypeScript требует проверку —
 * для этого ниже есть requireUser(), чтобы не писать её руками каждый раз.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Актуальное состояние аккаунта берём из БД, а не из токена.
 *
 * В токене лежит только id — этого достаточно. Всё остальное (email, а в
 * будущем роль или блокировка) читается свежим: токен неотзываем до истечения
 * срока, и любое изменение статуса аккаунта иначе вступало бы в силу лишь
 * через JWT_EXPIRES_IN. Цена — один SELECT по первичному ключу на запрос.
 *
 * Побочный, но важный эффект: удалённый аккаунт немедленно перестаёт работать,
 * хотя его токен формально ещё валиден.
 */
async function loadAccount(userId: string): Promise<{ id: string; email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw ApiError.unauthorized('Пользователь не найден');
  }

  return user;
}

/**
 * Middleware защиты роутов: проверяет `Authorization: Bearer <token>`.
 * Ошибки бросает через next() — формат ответа собирает errorHandler.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw ApiError.unauthorized('Требуется заголовок Authorization: Bearer <token>');
    }

    const payload = verifyAccessToken(token);
    req.user = await loadAccount(payload.sub);

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Достаёт пользователя из запроса, гарантируя его наличие на уровне типов.
 *
 * Нужна, чтобы в контроллерах за requireAuth не тащить `req.user!` — восклицание
 * подавляет проверку и молча ломается, если роут случайно оставят без requireAuth.
 * Здесь же промах превратится в честную 401.
 */
export function requireUser(req: Request): { id: string; email: string } {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user;
}
