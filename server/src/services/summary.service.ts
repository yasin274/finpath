import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { roundMoney, toNumber } from '../utils/money.js';
import { resolvePeriod } from '../schemas/common.schema.js';
import type { ByCategoryQuery, CashflowQuery, OverviewQuery } from '../schemas/summary.schema.js';

export interface OverviewSummary {
  period: { from: Date; to: Date };
  /** Сумма остатков по всем счетам — «сейчас», без привязки к периоду. */
  totalBalance: number;
  income: number;
  expense: number;
  /** Доходы минус расходы за период. Отрицательное значение — жили в минус. */
  net: number;
  accounts: {
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
    /** Доля счёта в общем балансе, % — из неё строится диаграмма распределения. */
    share: number;
  }[];
}

/**
 * Сводка для верхнего блока дашборда.
 *
 * Баланс и обороты живут в разных временных измерениях, и это не оплошность:
 * остаток — величина «на сейчас», доходы и расходы — за выбранный период.
 * Считать остаток «на конец периода» пришлось бы обратным проигрыванием всей
 * ленты; для дашборда это неоправданно, и поле period к балансу не относится.
 */
export async function getOverview(
  userId: string,
  query: OverviewQuery,
): Promise<OverviewSummary> {
  const period = resolvePeriod(query, 30);

  const [accounts, byKind] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true, balance: true, currency: true },
    }),
    prisma.transaction.groupBy({
      by: ['kind'],
      where: { userId, occurredAt: { gte: period.from, lte: period.to } },
      _sum: { amount: true },
    }),
  ]);

  const sumOf = (kind: 'INCOME' | 'EXPENSE'): number =>
    toNumber(byKind.find((row) => row.kind === kind)?._sum.amount);

  const income = sumOf('INCOME');
  const expense = sumOf('EXPENSE');

  const balances = accounts.map((account) => toNumber(account.balance));
  const totalBalance = roundMoney(balances.reduce((sum, value) => sum + value, 0));

  /**
   * Доли считаем от суммы МОДУЛЕЙ остатков.
   *
   * Если у одного счёта минус (кредитка), знаковая сумма может оказаться
   * близкой к нулю или отрицательной, и доли улетят в сотни процентов либо
   * поделятся на ноль. Модуль даёт устойчивую картину «сколько где лежит».
   */
  const totalWeight = balances.reduce((sum, value) => sum + Math.abs(value), 0);

  return {
    period,
    totalBalance,
    income: roundMoney(income),
    expense: roundMoney(expense),
    net: roundMoney(income - expense),
    accounts: accounts.map((account, index) => {
      const balance = balances[index] ?? 0;
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        balance,
        currency: account.currency,
        share: totalWeight > 0 ? Math.round((Math.abs(balance) / totalWeight) * 1000) / 10 : 0,
      };
    }),
  };
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
  /** Доля в общей сумме, % с одним знаком после запятой. */
  share: number;
}

export interface ByCategorySummary {
  period: { from: Date; to: Date };
  kind: 'INCOME' | 'EXPENSE';
  total: number;
  categories: CategorySlice[];
}

/** Цвет для операций без категории и для схлопнутого «Прочее». */
const NEUTRAL_COLOR = '#8f8f8f';

/**
 * Разбивка по категориям для кольцевой диаграммы.
 *
 * Хвост схлопывается в «Прочее» на сервере, а не на клиенте: иначе доли,
 * посчитанные до схлопывания, не сойдутся в 100 %, и легенда будет спорить
 * с диаграммой. Считать один раз в одном месте надёжнее.
 */
export async function getByCategory(
  userId: string,
  query: ByCategoryQuery,
): Promise<ByCategorySummary> {
  const period = resolvePeriod(query, 30);

  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, kind: query.kind, occurredAt: { gte: period.from, lte: period.to } },
    _sum: { amount: true },
  });

  // Справочник тянем одним запросом по уже известным id, а не include —
  // groupBy связи не поддерживает.
  const ids = grouped.map((row) => row.categoryId).filter((id): id is string => id !== null);
  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, color: true },
  });
  const byId = new Map(categories.map((category) => [category.id, category]));

  const slices: CategorySlice[] = grouped
    .map((row) => {
      const category = row.categoryId ? byId.get(row.categoryId) : undefined;
      return {
        categoryId: row.categoryId,
        name: category?.name ?? 'Без категории',
        color: category?.color ?? NEUTRAL_COLOR,
        total: roundMoney(toNumber(row._sum.amount)),
        share: 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const total = roundMoney(slices.reduce((sum, slice) => sum + slice.total, 0));

  const head = slices.slice(0, query.limit);
  const tail = slices.slice(query.limit);

  if (tail.length > 0) {
    head.push({
      categoryId: null,
      name: 'Прочее',
      color: NEUTRAL_COLOR,
      total: roundMoney(tail.reduce((sum, slice) => sum + slice.total, 0)),
      share: 0,
    });
  }

  for (const slice of head) {
    slice.share = total > 0 ? Math.round((slice.total / total) * 1000) / 10 : 0;
  }

  return { period, kind: query.kind, total, categories: head };
}

export interface CashflowMonth {
  /** Начало месяца в формате YYYY-MM — готовый ключ для оси графика. */
  month: string;
  income: number;
  expense: number;
  /** Сколько осталось: доход минус расход за месяц. */
  savings: number;
}

/** Строка, как её отдаёт сырой SQL ниже. */
type CashflowRow = { month: Date; income: number; expense: number };

/**
 * Помесячный денежный поток за последние N месяцев.
 *
 * Здесь сырой SQL, а не groupBy: Prisma умеет группировать только по колонкам,
 * а нужно по ВЫРАЖЕНИЮ date_trunc('month', ...). Вариант «вытащить все строки
 * и сгруппировать в JS» отпадает — он линеен по числу операций и на нескольких
 * годах истории тянет в память лишние десятки тысяч записей.
 *
 * SUM(...)::float8 — потому что numeric драйвер pg отдаёт строкой, и без
 * приведения в income прилетело бы "12345.00".
 */
export async function getCashflow(
  userId: string,
  query: CashflowQuery,
): Promise<{ months: CashflowMonth[] }> {
  // Начало месяца, отстоящего на (months - 1) назад: N-й месяц — текущий.
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - (query.months - 1));

  const rows = await prisma.$queryRaw<CashflowRow[]>`
    SELECT
      date_trunc('month', "occurredAt") AS month,
      COALESCE(SUM(CASE WHEN "kind" = 'INCOME'  THEN "amount" ELSE 0 END), 0)::float8 AS income,
      COALESCE(SUM(CASE WHEN "kind" = 'EXPENSE' THEN "amount" ELSE 0 END), 0)::float8 AS expense
    FROM "finpath_transactions"
    WHERE "userId" = ${userId}::uuid
      AND "occurredAt" >= ${from}
    GROUP BY 1
    ORDER BY 1
  `;

  const byMonth = new Map(rows.map((row) => [monthKey(row.month), row]));

  /**
   * Достраиваем пустые месяцы нулями.
   *
   * SQL возвращает только месяцы, где были операции, а столбчатая диаграмма с
   * дырами в оси читается как ошибка данных. Ноль — честное значение: операций
   * в этом месяце действительно не было.
   */
  const months: CashflowMonth[] = [];

  for (let index = 0; index < query.months; index++) {
    const cursor = new Date(from);
    cursor.setMonth(from.getMonth() + index);

    const key = monthKey(cursor);
    const row = byMonth.get(key);
    const income = roundMoney(row?.income ?? 0);
    const expense = roundMoney(row?.expense ?? 0);

    months.push({ month: key, income, expense, savings: roundMoney(income - expense) });
  }

  return { months };
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
