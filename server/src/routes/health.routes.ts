import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';

const router = Router();

// Публичный намеренно: health-check должен работать до и без авторизации.
router.get('/', healthController.health);

export default router;
