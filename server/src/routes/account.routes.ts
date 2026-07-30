import { Router } from 'express';
import * as controller from '../controllers/account.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import { idParamSchema } from '../schemas/common.schema.js';
import { createAccountSchema, updateAccountSchema } from '../schemas/account.schema.js';

const router = Router();

// Счета всегда чьи-то — публичных роутов в модуле нет вовсе.
router.use(requireAuth);

router.get('/', controller.list);
router.post('/', validate({ body: createAccountSchema }), controller.create);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateAccountSchema }),
  controller.update,
);
router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

export default router;
