import type { Request, Response } from 'express';
import * as accountService from '../services/account.service.js';
import { requireUser } from '../middlewares/auth.js';
import type { CreateAccountInput, UpdateAccountInput } from '../schemas/account.schema.js';

/** GET /api/accounts */
export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const accounts = await accountService.listAccounts(userId);

  res.status(200).json({ success: true, data: { accounts, total: accounts.length } });
}

/** POST /api/accounts */
export async function create(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const account = await accountService.createAccount(userId, req.body as CreateAccountInput);

  res.status(201).json({ success: true, data: { account } });
}

/** PATCH /api/accounts/:id */
export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const account = await accountService.updateAccount(
    userId,
    String(req.params['id']),
    req.body as UpdateAccountInput,
  );

  res.status(200).json({ success: true, data: { account } });
}

/** DELETE /api/accounts/:id */
export async function remove(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const id = String(req.params['id']);
  const { transactions } = await accountService.deleteAccount(userId, id);

  // Возвращаем, сколько операций уехало вместе со счётом: удаление каскадное,
  // и молчать о масштабе последствий нельзя.
  res.status(200).json({ success: true, data: { deleted: id, transactions } });
}
