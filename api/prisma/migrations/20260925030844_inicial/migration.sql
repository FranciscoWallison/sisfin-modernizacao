-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "remember_token" VARCHAR(100),
    "role" VARCHAR(255) NOT NULL DEFAULT 'client',
    "client_id" INTEGER,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logo" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "agency" VARCHAR(255),
    "account" VARCHAR(255),
    "default" BOOLEAN NOT NULL DEFAULT false,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_expenses" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "_lft" INTEGER NOT NULL,
    "_rgt" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "category_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_revenues" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "_lft" INTEGER NOT NULL,
    "_rgt" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "category_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_pays" (
    "id" SERIAL NOT NULL,
    "date_due" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "client_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "bill_pays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_receives" (
    "id" SERIAL NOT NULL,
    "date_due" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "client_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "bill_receives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" SERIAL NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "statementable_id" INTEGER NOT NULL,
    "statementable_type" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'movimento',
    "user_id" INTEGER,
    "action" VARCHAR(20),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "bank_accounts_client_id_idx" ON "bank_accounts"("client_id");

-- CreateIndex
CREATE INDEX "category_expenses_client_id_idx" ON "category_expenses"("client_id");

-- CreateIndex
CREATE INDEX "category_expenses__lft__rgt_parent_id_idx" ON "category_expenses"("_lft", "_rgt", "parent_id");

-- CreateIndex
CREATE INDEX "category_revenues_client_id_idx" ON "category_revenues"("client_id");

-- CreateIndex
CREATE INDEX "category_revenues__lft__rgt_parent_id_idx" ON "category_revenues"("_lft", "_rgt", "parent_id");

-- CreateIndex
CREATE INDEX "bill_pays_client_id_date_due_idx" ON "bill_pays"("client_id", "date_due");

-- CreateIndex
CREATE INDEX "bill_receives_client_id_date_due_idx" ON "bill_receives"("client_id", "date_due");

-- CreateIndex
CREATE INDEX "statements_client_id_bank_account_id_idx" ON "statements"("client_id", "bank_account_id");

-- CreateIndex
CREATE INDEX "statements_statementable_type_statementable_id_idx" ON "statements"("statementable_type", "statementable_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_expenses" ADD CONSTRAINT "category_expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_revenues" ADD CONSTRAINT "category_revenues_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_pays" ADD CONSTRAINT "bill_pays_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_pays" ADD CONSTRAINT "bill_pays_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_pays" ADD CONSTRAINT "bill_pays_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_receives" ADD CONSTRAINT "bill_receives_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_receives" ADD CONSTRAINT "bill_receives_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category_revenues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_receives" ADD CONSTRAINT "bill_receives_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
