import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { corsOrigin } from './config/env.js';

/**
 * Сборка Express-приложения.
 *
 * Вынесено отдельно от server.ts намеренно: здесь приложение только
 * конфигурируется, но не слушает порт. Благодаря этому его можно поднять
 * в тестах (supertest) без реального сокета.
 */
const app = express();

// За реверс-прокси (nginx, Render, Railway) — чтобы req.ip и protocol были настоящими.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({ origin: corsOrigin(), credentials: true }));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

/**
 * Раздача статики лендинга и дашборда тем же сервером.
 *
 * Finpath — обычные HTML-файлы в корне репозитория, отдельного веб-сервера для
 * них нет. Если поднять только API, дашборд пришлось бы открывать с другого
 * origin и разбираться с CORS ради страницы из соседней папки — проще отдать
 * её отсюда же и получить одинаковый origin у страницы и у /api.
 *
 * Путь ищем перебором, а не одной константой: рабочий каталог зависит от
 * способа запуска (npm start из server/, node dist/server.js, деплой).
 * `here` — это dist/ или src/, поэтому корень сайта на два уровня выше.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

const siteRoot = [
  path.resolve(here, '..', '..'),
  path.resolve(process.cwd(), '..'),
  process.cwd(),
].find((candidate) => existsSync(path.join(candidate, 'index.html')));

if (siteRoot) {
  app.use(express.static(siteRoot, { maxAge: '1h', index: 'index.html' }));
}

// Порядок критичен: сначала 404, потом обработчик ошибок — иначе errorHandler
// не увидит ошибки, а 404 перехватит вообще всё.
app.use(notFound);
app.use(errorHandler);

export default app;
