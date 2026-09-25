#!/usr/bin/env node
// T04 — ETL do banco do legado (MySQL) para o sistema novo (PostgreSQL). design.md §9.
//
//   node tools/migrar-dados.mjs            # relatório em .relatorios/ (fora do git: pode ter dados reais)
//   node tools/migrar-dados.mjs --seed     # relatório em docs/relatorios/etl-seed.md (só para o seed fictício)
//
// - Copia tabela a tabela PRESERVANDO ids e ajusta as sequences.
// - DOUBLE(8,2) → DECIMAL(12,2): arredonda para 2 casas e reporta o que mudou.
// - statementable_type "SisFin\Models\BillPay" → "BillPay".
// - Saldos migram COMO ESTÃO (ADR-003); o relatório compara saldo × soma do extrato (DUV-CON-005).
// - Relatório só com ids e valores: nunca nome, e-mail ou hash (revisão de segurança #12).
// - Só grava em banco local, salvo --permitir-remoto (TRUNCATE apaga o destino).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ORIGEM = process.env.LEGACY_DATABASE_URL ?? 'mysql://root:root@localhost:33061/sisfin';
const DESTINO = process.env.DATABASE_URL ?? 'postgresql://sisfin:sisfin@localhost:54321/sisfin';

if (!/@(localhost|127\.0\.0\.1|api-db)[:/]/.test(DESTINO) && !args.includes('--permitir-remoto')) {
  console.error(`Destino não é local (${DESTINO.replace(/\/\/[^@]*@/, '//***@')}). O ETL faz TRUNCATE; use --permitir-remoto se for isso mesmo.`);
  process.exit(1);
}

const bool = (v) => v === 1 || v === true || v === '1';
const DINHEIRO = { bank_accounts: ['balance'], bill_pays: ['value'], bill_receives: ['value'], statements: ['value', 'balance'] };

// Ordem respeita as FKs. "colunas" = colunas do destino; "transformar" adapta a linha da origem.
const TABELAS = [
  { nome: 'clients', colunas: ['id', 'name', 'email', 'code', 'created_at', 'updated_at'] },
  { nome: 'users', colunas: ['id', 'name', 'email', 'password', 'remember_token', 'role', 'client_id', 'created_at', 'updated_at'] },
  { nome: 'banks', colunas: ['id', 'name', 'logo', 'created_at', 'updated_at'] },
  {
    nome: 'bank_accounts',
    colunas: ['id', 'name', 'agency', 'account', 'default', 'balance', 'bank_id', 'client_id', 'created_at', 'updated_at'],
    transformar: (l) => ({ ...l, default: bool(l.default) }),
  },
  { nome: 'category_expenses', colunas: ['id', 'name', '_lft', '_rgt', 'parent_id', 'client_id', 'created_at', 'updated_at'] },
  { nome: 'category_revenues', colunas: ['id', 'name', '_lft', '_rgt', 'parent_id', 'client_id', 'created_at', 'updated_at'] },
  {
    nome: 'bill_pays',
    colunas: ['id', 'date_due', 'name', 'value', 'done', 'client_id', 'category_id', 'bank_account_id', 'created_at', 'updated_at'],
    transformar: (l) => ({ ...l, done: bool(l.done) }),
  },
  {
    nome: 'bill_receives',
    colunas: ['id', 'date_due', 'name', 'value', 'done', 'client_id', 'category_id', 'bank_account_id', 'created_at', 'updated_at'],
    transformar: (l) => ({ ...l, done: bool(l.done) }),
  },
  {
    nome: 'statements',
    colunas: ['id', 'value', 'balance', 'bank_account_id', 'client_id', 'statementable_id', 'statementable_type', 'kind', 'created_at', 'updated_at'],
    transformar: (l) => ({
      ...l,
      statementable_type: String(l.statementable_type).split('\\').pop(),
      kind: 'movimento',
    }),
  },
];

// DOUBLE → string decimal com 2 casas; registra quando o valor binário não era exatamente representável em centavos
const arredondamentos = [];
function dinheiro(tabela, coluna, id, valor) {
  const texto = Number(valor).toFixed(2);
  if (Math.abs(Number(texto) - Number(valor)) > 1e-9) arredondamentos.push({ tabela, coluna, id, de: valor, para: texto });
  return texto;
}

const origem = await mysql.createConnection({ uri: ORIGEM, dateStrings: true, supportBigNumbers: true });
const destino = new pg.Client({ connectionString: DESTINO });
await destino.connect();

const contagens = [];
try {
  await destino.query('BEGIN');
  await destino.query(`TRUNCATE ${TABELAS.map((t) => `"${t.nome}"`).reverse().join(', ')} RESTART IDENTITY CASCADE`);

  for (const t of TABELAS) {
    const [linhas] = await origem.query(`SELECT ${t.colunas.filter((c) => c !== 'kind').map((c) => '`' + c + '`').join(', ')} FROM \`${t.nome}\` ORDER BY id`);
    for (const bruta of linhas) {
      const l = t.transformar ? t.transformar(bruta) : bruta;
      for (const c of DINHEIRO[t.nome] ?? []) l[c] = dinheiro(t.nome, c, l.id, l[c]);
      const valores = t.colunas.map((c) => l[c] ?? null);
      const marcadores = t.colunas.map((_, i) => `$${i + 1}`).join(', ');
      await destino.query(`INSERT INTO "${t.nome}" (${t.colunas.map((c) => `"${c}"`).join(', ')}) VALUES (${marcadores})`, valores);
    }
    await destino.query(`SELECT setval(pg_get_serial_sequence('"${t.nome}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t.nome}"), 0) + 1, false)`);
    const { rows } = await destino.query(`SELECT COUNT(*)::int AS n FROM "${t.nome}"`);
    contagens.push({ tabela: t.nome, origem: linhas.length, destino: rows[0].n });
  }
  await destino.query('COMMIT');
} catch (e) {
  await destino.query('ROLLBACK');
  console.error(`ETL abortado (nada foi gravado): ${e.message}`);
  process.exitCode = 1;
  await origem.end();
  await destino.end();
  process.exit();
}

// ---- Verificações pós-carga (sobre o destino) ----
const q = async (sql) => (await destino.query(sql)).rows;
const divergenciaSaldo = await q(`
  SELECT b.id AS conta, b.client_id AS cliente, b.balance::text AS saldo, COALESCE(s.soma, 0)::text AS soma_extrato
  FROM bank_accounts b LEFT JOIN (SELECT bank_account_id, SUM(value) soma FROM statements GROUP BY bank_account_id) s
    ON s.bank_account_id = b.id
  WHERE b.balance <> COALESCE(s.soma, 0) ORDER BY b.id`);
const orfaos = await q(`
  SELECT s.id, s.statementable_type AS tipo, s.statementable_id AS origem_id FROM statements s
  WHERE (s.statementable_type = 'BillPay' AND NOT EXISTS (SELECT 1 FROM bill_pays b WHERE b.id = s.statementable_id))
     OR (s.statementable_type = 'BillReceive' AND NOT EXISTS (SELECT 1 FROM bill_receives b WHERE b.id = s.statementable_id))
  ORDER BY s.id`);
const tiposDesconhecidos = await q(`SELECT DISTINCT statementable_type AS tipo FROM statements WHERE statementable_type NOT IN ('BillPay','BillReceive')`);
const semCliente = await q(`SELECT id FROM users WHERE client_id IS NULL ORDER BY id`);
const ok = contagens.every((c) => c.origem === c.destino) && tiposDesconhecidos.length === 0;

// ---- Relatório ----
const agora = new Date().toISOString();
const tabelaMd = (linhas, colunas) =>
  linhas.length
    ? [`| ${colunas.join(' | ')} |`, `|${colunas.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${colunas.map((c) => l[c]).join(' | ')} |`)].join('\n')
    : '_nenhum_';
const relatorio = `# Relatório do ETL — legado (MySQL) → sistema novo (PostgreSQL)

- Gerado em: ${agora} por \`tools/migrar-dados.mjs\`${args.includes('--seed') ? ' (dados do **seed fictício**)' : ''}
- Resultado: ${ok ? '✅ contagens iguais em todas as tabelas' : '❌ DIVERGÊNCIA — ver abaixo'}
- Só ids e valores; nenhum dado pessoal (revisão de segurança #12).

## Contagens

${tabelaMd(contagens, ['tabela', 'origem', 'destino'])}

## Arredondamentos DOUBLE(8,2) → DECIMAL(12,2) (RN-CON-011)

${arredondamentos.length} valor(es) mudaram ao arredondar para centavos.
${tabelaMd(arredondamentos.slice(0, 50), ['tabela', 'coluna', 'id', 'de', 'para'])}

## Saldo × soma do extrato por conta bancária (DUV-CON-005)

Saldos migrados **como estão** (ADR-003). ${divergenciaSaldo.length} conta(s) com saldo ≠ soma do extrato.
${tabelaMd(divergenciaSaldo, ['conta', 'cliente', 'saldo', 'soma_extrato'])}

## Extratos órfãos (conta de origem excluída — RN-CON-010)

${orfaos.length} extrato(s) mantidos (histórico preservado, REQ-CON-09).
${tabelaMd(orfaos.slice(0, 50), ['id', 'tipo', 'origem_id'])}

## Usuários sem cliente (RN-CON-019)

${semCliente.length ? `${semCliente.length}: ids ${semCliente.map((u) => u.id).join(', ')} — no sistema novo não conseguem logar (REQ-CON-13).` : '_nenhum_'}

## Tipos de extrato não reconhecidos

${tiposDesconhecidos.length ? tiposDesconhecidos.map((t) => `- \`${t.tipo}\``).join('\n') : '_nenhum_'}
`;

const destinoRelatorio = args.includes('--seed')
  ? join(raiz, 'docs', 'relatorios', 'etl-seed.md')
  : join(raiz, '.relatorios', `etl-${agora.replace(/[:.]/g, '-')}.md`);
mkdirSync(dirname(destinoRelatorio), { recursive: true });
writeFileSync(destinoRelatorio, relatorio);

console.table(contagens);
console.log(`arredondamentos: ${arredondamentos.length} · saldo≠extrato: ${divergenciaSaldo.length} · órfãos: ${orfaos.length} · usuários sem cliente: ${semCliente.length}`);
console.log(`relatório: ${destinoRelatorio.slice(raiz.length + 1)}`);
await origem.end();
await destino.end();
process.exitCode = ok ? 0 : 1;
