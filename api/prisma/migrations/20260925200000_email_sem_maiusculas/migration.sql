-- RN-SIT-009 / ADR-009: e-mail único SEM diferenciar maiúsculas, como o unique:users do legado (MySQL utf8_unicode_ci).
-- Sem isto, dois cadastros simultâneos com "Ana@x.com" e "ana@x.com" passariam os dois. Índice por expressão: o
-- schema.prisma não o expressa (migration manual, como o índice parcial da conta padrão).
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
