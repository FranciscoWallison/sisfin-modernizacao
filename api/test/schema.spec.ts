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

  it('categoria da conta aponta para a tabela do tipo certo (revisão de segurança #6)', () => {
    expect(sql).toMatch(/"bill_pays_category_id_fkey" FOREIGN KEY \("category_id"\) REFERENCES "category_expenses"/);
    expect(sql).toMatch(/"bill_receives_category_id_fkey" FOREIGN KEY \("category_id"\) REFERENCES "category_revenues"/);
  });
});
