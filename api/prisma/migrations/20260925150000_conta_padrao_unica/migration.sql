-- REQ-CBA-02 / ADR-007: no máximo UMA conta bancária padrão por cliente, garantido pelo banco (rede de segurança da
-- troca atômica no serviço). Índice PARCIAL: o schema.prisma não expressa "WHERE", por isso a migration é manual
-- (ver design de contas-bancarias, "Mudanças após a aprovação"). O ETL acusa dado legado que violaria o índice.
CREATE UNIQUE INDEX "bank_accounts_um_padrao_por_cliente" ON "bank_accounts" ("client_id") WHERE "default";
