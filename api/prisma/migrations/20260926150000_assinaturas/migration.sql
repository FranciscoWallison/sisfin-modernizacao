-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "checkout_session_expires_at" TIMESTAMP(0),
ADD COLUMN     "checkout_session_id" VARCHAR(255),
ADD COLUMN     "checkout_session_url" VARCHAR(2048),
ADD COLUMN     "stripe_customer_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "plan_id" INTEGER,
    "provider_subscription_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "current_period_end" TIMESTAMP(0),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(0),
    "last_event_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "received_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_stripe_customer_id_key" ON "clients"("stripe_customer_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- No máximo UMA assinatura viva por cliente (DUV-ASS-005): o legado deixava assinar duas vezes (RN-ASS-004).
-- incomplete (3DS abandonado) não conta: o cliente pode tentar pagar de novo (revisão A07, S8). O Prisma não modela
-- índice parcial; ele vive só aqui (como o da conta padrão).
CREATE UNIQUE INDEX "subscriptions_uma_viva_por_cliente" ON "subscriptions" ("client_id") WHERE "status" NOT IN ('canceled', 'incomplete_expired', 'incomplete');
