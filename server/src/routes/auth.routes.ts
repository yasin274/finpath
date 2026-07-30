import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import { loginSchema, registerSchema } from '../schemas/auth.schema.js';

const router = Router();

// Публичные роуты.
router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);

// Защищённый роут: requireAuth обязан идти ДО контроллера.
router.get('/me', requireAuth, authController.me);

export default router;
