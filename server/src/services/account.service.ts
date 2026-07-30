import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AccountType } from '../generated/prisma/enums.js';
import { ApiError } from '../utils/ApiError.js';
import { toNumber } from '../utils/money.js';
import type { CreateAccountInput, UpdateAccountInput } from '../schemas/account.schema.js';

/** Счёт в том виде, в каком его ждёт фронтенд: balance — число, а не Decimal. */
export interface PublicAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  createdAt: Date;
}

type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  balance: Prisma.Decimal;
  currency: string;
  createdAt: Date;
};

function toPublic(account: AccountRow): PublicAccount {
  return { ...account, balance: toNumber(account.balance) };
}

const SELECT = {
  id: true,
  name: true,
  type: true,
  balance: true,
  currency: true,
  createdAt: true,
} as const;

export async function listAccounts(userId: string): Promise<PublicAccount[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: SELECT,
  });

  return accounts.map(toPublic);
}

export async function createAccount(
  userId: string,
  input: CreateAccountInput,
): Promise<PublicAccount> {
  try {
    const account = await prisma.account.create({
      data: { userId, ...input },
      select: SELECT,
    });

    return toPublic(account);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict(`Счёт с названием «${input.name}» уже есть`);
    }
    throw error;
  }
}

export async function updateAccount(
  userId: string,
  id: string,
  input: UpdateAccountInput,
): Promise<PublicAccount> {
  /**
   * Владельца проверяем ОТДЕЛЬНЫМ запросом, а не через `where: { id, userId }`
   * в update: составной where у Prisma требует уникального индекса, а
   * updateMany не возвращает изменённую строку. Лишний SELECT здесь — плата
   * за то, что чужой счёт нельзя изменить даже теоретически.
   */
  await requireOwnAccount(userId, id);

  try {
    const account = await prisma.account.update({
      where: { id },
      data: input,
      select: SELECT,
    });

    return toPublic(account);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict(`Счёт с названием «${input.name}» уже есть`);
    }
    throw error;
  }
}

/**
 * Удаление счёта уносит и его операции — это каскад на уровне БД.
 *
 * Мягкого удаления сознательно нет: счёт без операций бессмыслен, а «архивный»
 * счёт с историей — уже другая функция, и делать её побочным эффектом DELETE
 * было бы сюрпризом. Зато пользователю честно сообщаем, сколько строк уйдёт.
 */
export async function deleteAccount(userId: string, id: string): Promise<{ transactions: number }> {
  await requireOwnAccount(userId, id);

  const transactions = await prisma.transaction.count({ where: { accountId: id } });
  await prisma.account.delete({ where: { id } });

  return { transactions };
}

/**
 * Проверка «счёт существует и принадлежит этому пользователю».
 *
 * 404, а не 403, для чужого счёта — намеренно: иначе по коду ответа можно
 * перебором выяснить, какие идентификаторы вообще заведены в системе.
 */
export async function requireOwnAccount(userId: string, id: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!account) {
    throw ApiError.notFound('Счёт не найден');
  }
}
