import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { EntryKind } from '../generated/prisma/enums.js';
import { ApiError } from '../utils/ApiError.js';
import { toNumber } from '../utils/money.js';
import { requireOwnAccount } from './account.service.js';
import { requireOwnCategory } from './category.service.js';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from '../schemas/transaction.schema.js';

/** Операция в форме, пригодной для отдачи наружу. */
export interface PublicTransaction {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: number;
  kind: EntryKind;
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
}

/**
 * Джойним счёт и категорию сразу.
 *
 * Лента операций в интерфейсе показывает названия, а не идентификаторы. Без
 * include фронтенду пришлось бы догружать справочники и склеивать их руками —
 * лишний раунд-трип ради данных, которые всё равно берутся из той же базы.
 */
const INCLUDE = {
  account: { select: { name: true } },
  category: { select: { name: true, color: true } },
} as const;

type TransactionRow = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: Prisma.Decimal;
  kind: EntryKind;
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
  account: { name: string };
  category: { name: string; color: string } | null;
};

function toPublic(row: TransactionRow): PublicTransaction {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    amount: toNumber(row.amount),
    kind: row.kind,
    description: row.description,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

/**
 * Влияние операции на остаток счёта.
 *
 * Единственное место, где знак вообще появляется: в БД сумма всегда
 * положительная, направление задаёт kind. Пока правило живёт в одной функции,
 * доход и расход не могут разъехаться.
 */
function balanceDelta(kind: EntryKind, amount: Prisma.Decimal | number): Prisma.Decimal {
  const value = new Prisma.Decimal(amount as never);
  return kind === 'INCOME' ? value : value.negated();
}

export interface TransactionsPage {
  items: PublicTransaction[];
  total: number;
  page: number;
  limit: number;
  /** Сколько страниц всего — фронтенду иначе пришлось бы считать это самому. */
  pages: number;
}

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
): Promise<TransactionsPage> {
  const where: Prisma.TransactionWhereInput = {
    userId,
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  // Считаем и выбираем одним заходом: два независимых await подряд дали бы
  // два последовательных раунд-трипа к базе там, где хватает одного.
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: INCLUDE,
      // Вторичная сортировка по id обязательна: у операций одного дня время
      // одинаковое, и без стабильного тай-брейка одна и та же запись может
      // попасть на две соседние страницы или не попасть ни на одну.
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toPublic),
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<PublicTransaction> {
  // Проверки владения — до транзакции: смысла открывать её ради заведомо
  // отклонённого запроса нет, а ошибку пользователь получит ту же.
  await requireOwnAccount(userId, input.accountId);
  if (input.categoryId) await requireOwnCategory(userId, input.categoryId);

  /**
   * Запись операции и правка остатка — одной транзакцией.
   *
   * Иначе сбой между двумя запросами оставляет расход, не списанный со счёта:
   * остаток разъезжается с историей, и найти расхождение потом почти нечем.
   */
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        amount: input.amount,
        kind: input.kind,
        description: input.description ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
      include: INCLUDE,
    });

    await tx.account.update({
      where: { id: input.accountId },
      data: { balance: { increment: balanceDelta(input.kind, input.amount) } },
    });

    return created;
  });

  return toPublic(row);
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<PublicTransaction> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true, accountId: true, amount: true, kind: true },
  });

  if (!existing) {
    throw ApiError.notFound('Операция не найдена');
  }

  if (input.categoryId) await requireOwnCategory(userId, input.categoryId);

  const nextKind = input.kind ?? existing.kind;
  const nextAmount = input.amount ?? existing.amount;

  /**
   * Остаток правим на РАЗНИЦУ влияний, а не пересчитываем с нуля.
   *
   * Полный пересчёт остатка потребовал бы просуммировать всю историю счёта —
   * операция линейная по числу строк и на длинной ленте заметно дорогая.
   * Разница же не зависит от объёма данных.
   */
  const delta = balanceDelta(nextKind, nextAmount).minus(
    balanceDelta(existing.kind, existing.amount),
  );

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id },
      data: {
        // categoryId проверяем на undefined, а не на falsy: null здесь —
        // осмысленное «убрать категорию», и затирать его нельзя.
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      },
      include: INCLUDE,
    });

    if (!delta.isZero()) {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { balance: { increment: delta } },
      });
    }

    return updated;
  });

  return toPublic(row);
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true, accountId: true, amount: true, kind: true },
  });

  if (!existing) {
    throw ApiError.notFound('Операция не найдена');
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });

    // Откатываем ровно то влияние, которое операция оказала при создании.
    await tx.account.update({
      where: { id: existing.accountId },
      data: { balance: { increment: balanceDelta(existing.kind, existing.amount).negated() } },
    });
  });
}
