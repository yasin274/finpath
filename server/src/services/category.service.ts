import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { EntryKind } from '../generated/prisma/enums.js';
import { ApiError } from '../utils/ApiError.js';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '../schemas/category.schema.js';

export interface PublicCategory {
  id: string;
  name: string;
  kind: EntryKind;
  color: string;
  createdAt: Date;
}

const SELECT = { id: true, name: true, kind: true, color: true, createdAt: true } as const;

export async function listCategories(
  userId: string,
  query: ListCategoriesQuery,
): Promise<PublicCategory[]> {
  return prisma.category.findMany({
    where: { userId, ...(query.kind ? { kind: query.kind } : {}) },
    orderBy: { name: 'asc' },
    select: SELECT,
  });
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
): Promise<PublicCategory> {
  try {
    return await prisma.category.create({ data: { userId, ...input }, select: SELECT });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict(`Категория «${input.name}» уже есть`);
    }
    throw error;
  }
}

export async function updateCategory(
  userId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<PublicCategory> {
  await requireOwnCategory(userId, id);

  try {
    return await prisma.category.update({ where: { id }, data: input, select: SELECT });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict(`Категория «${input.name}» уже есть`);
    }
    throw error;
  }
}

/**
 * Удаление категории НЕ удаляет операции — у них проставится categoryId = null
 * (onDelete: SetNull в схеме). Деньги ушли, даже если рубрику упразднили;
 * терять из-за переименования рубрик реальные траты недопустимо.
 */
export async function deleteCategory(
  userId: string,
  id: string,
): Promise<{ transactionsUncategorized: number }> {
  await requireOwnCategory(userId, id);

  const transactionsUncategorized = await prisma.transaction.count({ where: { categoryId: id } });
  await prisma.category.delete({ where: { id } });

  return { transactionsUncategorized };
}

/** 404 вместо 403 по той же причине, что и у счетов: не подсказывать чужие id. */
export async function requireOwnCategory(userId: string, id: string): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!category) {
    throw ApiError.notFound('Категория не найдена');
  }
}
