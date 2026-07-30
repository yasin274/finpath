import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';

/**
 * Стоимость хеширования bcrypt.
 *
 * 12 — разумный баланс на 2026 год: ~200–400 мс на обычном железе. Дорого для
 * перебора, терпимо для живого логина. Значение хранится внутри самого хеша,
 * поэтому его можно поднять позже — старые хеши продолжат проверяться.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Хеш-заглушка для несуществующих пользователей (см. login).
 * Считается один раз при старте модуля, а не на каждый запрос.
 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalisation', BCRYPT_ROUNDS);

/**
 * Стартовый набор данных нового пользователя.
 *
 * Без него дашборд после регистрации пустой: ни счёта, чтобы завести операцию,
 * ни категорий, чтобы её разметить. Первое впечатление от продукта — экран
 * «здесь ничего нет и непонятно, с чего начать», поэтому минимальный каркас
 * создаётся сразу. Цвета совпадают с палитрой интерфейса, чтобы легенда
 * диаграммы выглядела осмысленно с первого дня.
 */
const STARTER_ACCOUNT = { name: 'Основная карта', type: 'CARD' as const };

const STARTER_CATEGORIES = [
  { name: 'Жильё', kind: 'EXPENSE' as const, color: '#c8f169' },
  { name: 'Продукты', kind: 'EXPENSE' as const, color: '#a8d94f' },
  { name: 'Транспорт', kind: 'EXPENSE' as const, color: '#8f8f8f' },
  { name: 'Развлечения', kind: 'EXPENSE' as const, color: '#5f5f5f' },
  { name: 'Зарплата', kind: 'INCOME' as const, color: '#c8f169' },
];

/** Пользователь в том виде, в каком его можно отдавать наружу. */
export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

/**
 * Явный white-list полей.
 *
 * Принципиально не делаю `const { passwordHash, ...rest } = user`: при
 * добавлении нового чувствительного поля в модель такой спред молча утечёт
 * его в API, а белый список — нет.
 */
function toPublicUser(user: { id: string; email: string; createdAt: Date }): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

/** Регистрация нового пользователя вместе со стартовым набором данных. */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    // Одна транзакция на всё: пользователь без счёта и категорий — заведомо
    // сломанное состояние, и оставлять его после частичного сбоя нельзя.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, passwordHash },
        select: { id: true, email: true, createdAt: true },
      });

      await tx.account.create({ data: { userId: created.id, ...STARTER_ACCOUNT } });
      await tx.category.createMany({
        data: STARTER_CATEGORIES.map((category) => ({ userId: created.id, ...category })),
      });

      return created;
    });

    return {
      user: toPublicUser(user),
      token: signAccessToken({ sub: user.id, email: user.email }),
    };
  } catch (error) {
    // P2002 — нарушение @unique. Полагаемся на ограничение в БД, а не на
    // предварительный SELECT: между проверкой и вставкой два параллельных
    // запроса успели бы создать дубль. БД — единственный честный арбитр.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict('Пользователь с таким email уже зарегистрирован');
    }
    throw error;
  }
}

/** Вход по email и паролю. */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, createdAt: true, passwordHash: true },
  });

  /**
   * Если пользователя нет — всё равно прогоняем bcrypt по хешу-заглушке.
   *
   * Иначе ответ «нет такого email» возвращался бы за единицы миллисекунд,
   * а «email есть, пароль неверный» — за сотни. По одной этой разнице
   * перебором вычисляется, кто зарегистрирован в сервисе.
   */
  const passwordMatches = user
    ? await bcrypt.compare(input.password, user.passwordHash)
    : await bcrypt.compare(input.password, DUMMY_HASH).then(() => false);

  // Текст ошибки одинаковый в обоих случаях — по той же причине.
  if (!user || !passwordMatches) {
    throw ApiError.unauthorized('Неверный email или пароль');
  }

  return {
    user: toPublicUser(user),
    token: signAccessToken({ sub: user.id, email: user.email }),
  };
}

/** Текущий пользователь по id из токена. */
export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });

  // Токен валиден, а пользователя нет — аккаунт удалили уже после выдачи токена.
  if (!user) {
    throw ApiError.unauthorized('Пользователь не найден');
  }

  return toPublicUser(user);
}
