-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "finpath_account_type" AS ENUM ('CARD', 'CASH', 'SAVINGS');

-- CreateEnum
CREATE TYPE "finpath_entry_kind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "finpath_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finpath_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finpath_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "finpath_account_type" NOT NULL DEFAULT 'CARD',
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finpath_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finpath_categories" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "finpath_entry_kind" NOT NULL DEFAULT 'EXPENSE',
    "color" VARCHAR(9) NOT NULL DEFAULT '#8f8f8f',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finpath_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finpath_transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "categoryId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "kind" "finpath_entry_kind" NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finpath_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finpath_users_email_key" ON "finpath_users"("email");

-- CreateIndex
CREATE INDEX "finpath_accounts_userId_idx" ON "finpath_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "finpath_accounts_userId_name_key" ON "finpath_accounts"("userId", "name");

-- CreateIndex
CREATE INDEX "finpath_categories_userId_idx" ON "finpath_categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "finpath_categories_userId_name_kind_key" ON "finpath_categories"("userId", "name", "kind");

-- CreateIndex
CREATE INDEX "finpath_transactions_userId_occurredAt_idx" ON "finpath_transactions"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "finpath_transactions_userId_accountId_idx" ON "finpath_transactions"("userId", "accountId");

-- CreateIndex
CREATE INDEX "finpath_transactions_categoryId_idx" ON "finpath_transactions"("categoryId");

-- AddForeignKey
ALTER TABLE "finpath_accounts" ADD CONSTRAINT "finpath_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "finpath_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finpath_categories" ADD CONSTRAINT "finpath_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "finpath_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finpath_transactions" ADD CONSTRAINT "finpath_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "finpath_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finpath_transactions" ADD CONSTRAINT "finpath_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finpath_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finpath_transactions" ADD CONSTRAINT "finpath_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finpath_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

