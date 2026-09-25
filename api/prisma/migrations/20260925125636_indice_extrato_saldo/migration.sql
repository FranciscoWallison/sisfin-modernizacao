-- DropIndex
DROP INDEX "statements_client_id_bank_account_id_idx";

-- CreateIndex
CREATE INDEX "statements_client_id_bank_account_id_created_at_id_idx" ON "statements"("client_id", "bank_account_id", "created_at", "id");
