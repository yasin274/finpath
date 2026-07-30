import { Router } from 'express';
import * as controller from '../controllers/summary.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import {
  byCategoryQuerySchema,
  cashflowQuerySchema,
  overviewQuerySchema,
} from '../schemas/summary.schema.js';

const router = Router();

router.use(requireAuth);

router.get('/overview', validate({ query: overviewQuerySchema }), controller.overview);
router.get('/by-category', validate({ query: byCategoryQuerySchema }), controller.byCategory);
router.get('/cashflow', validate({ query: cashflowQuerySchema }), controller.cashflow);

export default router;
