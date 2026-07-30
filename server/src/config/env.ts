import 'dotenv/config';
import { z } from 'zod';

/**
 * Единая точка валидации окружения.
 *
 * Приложение должно падать СРАЗУ на старте с внятным текстом, если переменные
 * заданы криво, а не через полчаса на первом запросе к БД. Поэтому схема
 * строгая, а сообщения — с подсказкой, чем чинить.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * 4400, а не 3000: база и машина общие с другими проектами автора,
   * и занятый порт — самая частая причина «почему не стартует».
   */
  PORT: z.coerce.number().int().positive().max(65535).default(4400),

  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL обязателен')
    .refine(
      (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
      'DATABASE_URL должен начинаться с postgresql:// или postgres://',
    ),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET должен быть не короче 32 символов — сгенерируйте его через `npm run keygen`'),

  JWT_EXPIRES_IN: z.string().default('7d'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // z.prettifyError — идиома Zod 4 (в Zod 3 это делалось через .format()).
  console.error('\nНекорректные переменные окружения:\n');
  console.error(z.prettifyError(parsed.error));
  console.error('\nПодсказка: скопируйте .env.example в .env и заполните значения.\n');
  process.exit(1);
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/** Разбирает CORS_ORIGIN в форму, понятную пакету `cors`. */
export function corsOrigin(): string | string[] {
  if (env.CORS_ORIGIN.trim() === '*') return '*';
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
