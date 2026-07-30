import { Router } from 'express';
import * as controller from '../controllers/transaction.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import { idParamSchema } from '../schemas/common.schema.js';
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from '../schemas/transaction.schema.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listTransactionsQuerySchema }), controller.list);
router.post('/', validate({ body: createTransactionSchema }), controller.create);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTransactionSchema }),
  controller.update,
);
router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

export default router;
