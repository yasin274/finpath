import { Router } from 'express';
import * as controller from '../controllers/category.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import { idParamSchema } from '../schemas/common.schema.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../schemas/category.schema.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listCategoriesQuerySchema }), controller.list);
router.post('/', validate({ body: createCategorySchema }), controller.create);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCategorySchema }),
  controller.update,
);
router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

export default router;
