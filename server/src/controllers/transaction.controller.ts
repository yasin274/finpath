import type { Request, Response } from 'express';
import * as transactionService from '../services/transaction.service.js';
import { requireUser } from '../middlewares/auth.js';
import { validatedQuery } from '../middlewares/validate.js';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from '../schemas/transaction.schema.js';

/** GET /api/transactions?from=&to=&accountId=&categoryId=&kind=&page=&limit= */
export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const page = await transactionService.listTransactions(
    userId,
    validatedQuery<ListTransactionsQuery>(req),
  );

  res.status(200).json({ success: true, data: page });
}

/** POST /api/transactions */
export async function create(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const transaction = await transactionService.createTransaction(
    userId,
    req.body as CreateTransactionInput,
  );

  res.status(201).json({ success: true, data: { transaction } });
}

/** PATCH /api/transactions/:id */
export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const transaction = await transactionService.updateTransaction(
    userId,
    String(req.params['id']),
    req.body as UpdateTransactionInput,
  );

  res.status(200).json({ success: true, data: { transaction } });
}

/** DELETE /api/transactions/:id */
export async function remove(req: Request, res: Response): Promise<void> {
  const { id: userId } = requireUser(req);
  const id = String(req.params['id']);

  await transactionService.deleteTransaction(userId, id);

  res.status(200).json({ success: true, data: { deleted: id } });
}
