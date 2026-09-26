// T03 — o schema gerado cumpre as decisões do ADR-003 (lê o SQL da migration; não precisa de banco).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'prisma', 'migrations');
const sql = readdirSync(dir)
  .filter((d) => !d.endsWith('.toml'))
  .map((d) => readFileSync(join(dir, d, 'migration.sql'), 'utf8'))
  .join('\n');

const tabela = (nome: string): string => {
  const m = sql.match(new RegExp(`CREATE TABLE "${nome}" \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`tabela ${nome} não encontrada na migration`);
  return m[1];
};

describe('schema (T03)', () => {
  it.each(['bill_pays', 'bill_receives'])('%s.done é BOOLEAN NOT NULL DEFAULT false (REQ-CON-10 / RN-CON-012)', (t) => {
    expect(tabela(t)).toMatch(/"done" BOOLEAN NOT NULL DEFAULT false/);
  });

  it.each([
    ['bill_pays', 'value'],
    ['bill_receives', 'value'],
    ['bank_accounts', 'balance'],
    ['statements', 'value'],
    ['statements', 'balance'],
  ])('%s.%s é DECIMAL(12,2), nunca ponto flutuante (RN-CON-011)', (t, coluna) => {
    expect(tabela(t)).toMatch(new RegExp(`"${coluna}" DECIMAL\\(12,2\\) NOT NULL`));
  });

  it('não há coluna DOUBLE/REAL/FLOAT em lugar nenhum', () => {
    expect(sql).not.toMatch(/DOUBLE PRECISION|\bREAL\b|\bFLOAT/i);
  });

  it('statements tem client_id obrigatório (tenant) e colunas de auditoria (REQ-CON-13)', () => {
    const s = tabela('statements');
    expect(s).toMatch(/"client_id" INTEGER NOT NULL/);
    expect(s).toMatch(/"kind" VARCHAR\(20\) NOT NULL DEFAULT 'movimento'/);
    expect(s).toMatch(/"user_id" INTEGER/);
    expect(s).toMatch(/"action" VARCHAR\(20\)/);
  });

  describe('assinaturas (P01, ADR-011)', () => {
    it('plans.value é DECIMAL(12,2) (o legado guardava texto — RN-ASS-001)', () => {
      expect(tabela('plans')).toMatch(/"value" DECIMAL\(12,2\) NOT NULL/);
    });

    it('subscriptions pertence ao cliente (tenant) e guarda o id do provedor, único', () => {
      const s = tabela('subscriptions');
      expect(s).toMatch(/"client_id" INTEGER NOT NULL/);
      expect(s).toMatch(/"provider_subscription_id" VARCHAR\(255\) NOT NULL/);
      expect(sql).toMatch(/CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key"/);
    });

    it('no máximo UMA assinatura viva por cliente: índice único parcial (DUV-ASS-005)', () => {
      expect(sql).toMatch(/CREATE UNIQUE INDEX "subscriptions_uma_viva_por_cliente" ON "subscriptions" \("client_id"\) WHERE "status" NOT IN \('canceled', 'incomplete_expired', 'incomplete'\)/);
    });

    it('webhook_events.id é a chave (idempotência por id do evento — REQ-ASS-03)', () => {
      expect(tabela('webhook_events')).toMatch(/CONSTRAINT "webhook_events_pkey" PRIMARY KEY \("id"\)/);
    });

    it('clients.stripe_customer_id é único e opcional', () => {
      expect(sql).toMatch(/ADD COLUMN\s+"stripe_customer_id" VARCHAR\(255\)[,;]/);
      expect(sql).toMatch(/CREATE UNIQUE INDEX "clients_stripe_customer_id_key"/);
    });
  });

  it('categoria da conta aponta para a tabela do tipo certo (revisão de segurança #6)', () => {
    expect(sql).toMatch(/"bill_pays_category_id_fkey" FOREIGN KEY \("category_id"\) REFERENCES "category_expenses"/);
    expect(sql).toMatch(/"bill_receives_category_id_fkey" FOREIGN KEY \("category_id"\) REFERENCES "category_revenues"/);
  });
});
