import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 больше НЕ читает .env самостоятельно — отсюда `import 'dotenv/config'`.
// Строка подключения тоже переехала из schema.prisma сюда.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
