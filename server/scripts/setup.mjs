/**
 * Разворачивает базу Finpath с нуля: схема + демо-данные.
 *
 * ── Почему не `prisma migrate deploy` ───────────────────────────────────────
 *
 * Supabase выдаёт две строки подключения. Рабочая — transaction pooler на
 * порту 6543, и через него не проходит schema engine Prisma: pooler не держит
 * сессионное состояние, на котором тот построен. Поэтому DDL применяется
 * обычным клиентом pg, одним куском внутри транзакции.
 *
 * ── Идемпотентность ─────────────────────────────────────────────────────────
 *
 * Скрипт можно гонять повторно: DDL пропускается, если таблицы уже есть, а
 * демо-пользователь пересоздаётся начисто (ON DELETE CASCADE уносит его счета
 * и операции). Так повторный запуск не плодит дублей и не копит мусор.
 *
 *   node scripts/setup.mjs          — схема и демо-данные
 *   node scripts/setup.mjs --schema — только схема, без демо
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));
const schemaOnly = process.argv.includes('--schema');

const DEMO_EMAIL = 'demo@finpath.app';
const DEMO_PASSWORD = 'demo12345';

if (!process.env.DATABASE_URL) {
  console.error(
    'Не задан DATABASE_URL.\n\n' +
      'Открой server/.env и вставь строку подключения из Supabase:\n' +
      '  проект → Connect → ORM → Prisma → Transaction pooler (порт 6543).',
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  // ── Схема ────────────────────────────────────────────────────────────────
  const { rows: existing } = await client.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_name like 'finpath_%'
  `);

  if (existing.length > 0) {
    console.log(`Схема уже на месте: ${existing.length} таблиц finpath_*.`);
  } else {
    const ddl = await readFile(
      resolve(here, '../prisma/migrations/0_init/migration.sql'),
      'utf8',
    );
    await client.query('begin');
    await client.query(ddl);
    await client.query('commit');
    console.log('Схема создана.');
  }

  if (schemaOnly) {
    console.log('Демо-данные пропущены (--schema).');
    process.exit(0);
  }

  // ── Демо-пользователь ────────────────────────────────────────────────────
  //
  // Нужен, чтобы дашборд можно было показать вживую, а не на пустом экране:
  // портфолио смотрят полминуты, и заводить счета руками никто не станет.
  await client.query('begin');
  await client.query('delete from finpath_users where email = $1', [DEMO_EMAIL]);

  const userId = randomUUID();
  await client.query(
    'insert into finpath_users (id, email, "passwordHash", "updatedAt") values ($1, $2, $3, now())',
    [userId, DEMO_EMAIL, await bcrypt.hash(DEMO_PASSWORD, 10)],
  );

  const accounts = [
    { id: randomUUID(), name: 'Основная карта', type: 'CARD', balance: 84250.4 },
    { id: randomUUID(), name: 'Наличные', type: 'CASH', balance: 12300 },
    { id: randomUUID(), name: 'Накопительный', type: 'SAVINGS', balance: 210000 },
  ];
  for (const a of accounts) {
    await client.query(
      'insert into finpath_accounts (id, "userId", name, type, balance) values ($1,$2,$3,$4::"finpath_account_type",$5)',
      [a.id, userId, a.name, a.type, a.balance],
    );
  }

  const categories = [
    { id: randomUUID(), name: 'Зарплата', kind: 'INCOME', color: '#c8f169' },
    { id: randomUUID(), name: 'Подработка', kind: 'INCOME', color: '#7ee0c0' },
    { id: randomUUID(), name: 'Продукты', kind: 'EXPENSE', color: '#ff8a65' },
    { id: randomUUID(), name: 'Транспорт', kind: 'EXPENSE', color: '#64b5f6' },
    { id: randomUUID(), name: 'Жильё', kind: 'EXPENSE', color: '#ba9cf5' },
    { id: randomUUID(), name: 'Кафе', kind: 'EXPENSE', color: '#ffd166' },
    { id: randomUUID(), name: 'Связь', kind: 'EXPENSE', color: '#9aa0a6' },
  ];
  for (const c of categories) {
    await client.query(
      'insert into finpath_categories (id, "userId", name, kind, color) values ($1,$2,$3,$4::"finpath_entry_kind",$5)',
      [c.id, userId, c.name, c.kind, c.color],
    );
  }

  const cat = Object.fromEntries(categories.map((c) => [c.name, c.id]));
  const card = accounts[0].id;
  const cash = accounts[1].id;

  /**
   * Ежемесячный набор операций. Суммы неровные намеренно: ряд из круглых
   * чисел сразу читается как заглушка, а диаграммы на нём выглядят
   * синтетически.
   */
  const monthly = [
    ['Зарплата', 'INCOME', 96000, card, 'Зарплата за месяц', 5],
    ['Подработка', 'INCOME', 18500, card, 'Вёрстка лендинга', 17],
    ['Жильё', 'EXPENSE', 32000, card, 'Аренда квартиры', 6],
    ['Продукты', 'EXPENSE', 4380.5, card, 'Пятёрочка', 8],
    ['Продукты', 'EXPENSE', 2965.2, cash, 'Рынок', 14],
    ['Продукты', 'EXPENSE', 5120.75, card, 'Ашан', 22],
    ['Транспорт', 'EXPENSE', 2400, card, 'Проездной', 7],
    ['Транспорт', 'EXPENSE', 780.5, cash, 'Такси', 19],
    ['Кафе', 'EXPENSE', 1240, card, 'Кофейня', 11],
    ['Кафе', 'EXPENSE', 2870.3, card, 'Ужин с друзьями', 24],
    ['Связь', 'EXPENSE', 650, card, 'Мобильная связь', 3],
  ];

  /**
   * Двенадцать месяцев, а не три: на дашборде денежный поток строится за год,
   * и на коротком ряде девять столбцов из двенадцати оставались нулевыми —
   * график выглядел сломанным, хотя считал правильно.
   *
   * Коэффициенты по месяцам заданы списком, а не случайно: демо должно
   * выглядеть одинаково при каждом прогоне, иначе скриншоты в портфолио
   * разойдутся с тем, что увидит зашедший.
   */
  const SEASONALITY = [0.82, 0.9, 1.05, 0.94, 1.12, 1.2, 0.88, 1.0, 1.15, 0.92, 1.08, 1.0];

  /**
   * Подработка по месяцам, ноль — месяц без заказов.
   *
   * Отдельным списком, потому что доход из двух ровных слагаемых даёт почти
   * прямую линию: разброс выходил в 6 % и график выглядел сломанным сильнее,
   * чем когда в нём были нули. Фриланс так и приходит — рывками.
   */
  const FREELANCE = [0, 24000, 12500, 0, 31000, 18500, 0, 9800, 42000, 0, 15600, 27300];

  const now = new Date();
  let count = 0;

  for (let back = 11; back >= 0; back--) {
    const slot = (12 - back) % 12;
    const factor = SEASONALITY[slot];

    for (const [category, kind, amount, accountId, description, day] of monthly) {
      const occurredAt = new Date(now.getFullYear(), now.getMonth() - back, day);
      if (occurredAt > now) continue; // операции «из будущего» в текущем месяце

      // Месяц без заказов — операции просто нет, а не нулевая строка:
      // ноль в ленте выглядит как ошибка ввода.
      if (category === 'Подработка' && FREELANCE[slot] === 0) continue;

      // Зарплата ровная — её колебания выглядели бы странно; подработка
      // берётся из своего списка; остальное дышит вместе с сезонностью.
      const value =
        category === 'Зарплата'
          ? amount
          : category === 'Подработка'
            ? FREELANCE[slot]
            : Math.round(amount * factor * 100) / 100;

      await client.query(
        `insert into finpath_transactions
           (id, "userId", "accountId", "categoryId", amount, kind, description, "occurredAt")
         values ($1,$2,$3,$4,$5,$6::"finpath_entry_kind",$7,$8)`,
        [randomUUID(), userId, accountId, cat[category], value, kind, description, occurredAt],
      );
      count++;
    }
  }

  await client.query('commit');

  console.log(
    `Демо-данные готовы: ${accounts.length} счёта, ${categories.length} категорий, ${count} операций.\n\n` +
      `  Вход:  ${DEMO_EMAIL}\n  Пароль: ${DEMO_PASSWORD}\n`,
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('Не получилось:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
