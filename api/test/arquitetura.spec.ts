// T02 — sensores de arquitetura: as regras existem, pegam violação e a mensagem ensina o que fazer.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = join(__dirname, '..');

/**
 * Arquivos que podem ter SQL cru SEM clientId — e apenas sobre as tabelas listadas (ver o teste de SQL cru abaixo):
 * - `users` (revisão de segurança do site, S1): igualdade de e-mail sem diferenciar maiúsculas precisa de
 *   lower(email) = lower($1) — o `mode: 'insensitive'` do Prisma vira ILIKE sem escape. `users` é a raiz do tenant;
 * - `banks` + `bank_accounts` (admin de bancos, ADR-010): trava a linha do banco e testa se QUALQUER conta usa o
 *   banco (EXISTS, sem devolver dado de cliente) — `banks` não tem tenant e a rota é só de admin.
 */
const EXCECOES_SQL: Record<string, string[]> = {
  'src/shared/auth-compat/usuarios.repositorio.ts': ['users'],
  'src/modules/cadastro/infra/cadastro.repositorio.ts': ['users'],
  'src/modules/admin-bancos/infra/bancos.repositorio.ts': ['banks', 'bank_accounts'],
};
const depcruise = (alvo: string) =>
  spawnSync('npx', ['depcruise', alvo, '--config', '.dependency-cruiser.cjs', '--output-type', 'err-long'], {
    cwd: raiz,
    encoding: 'utf8',
    shell: true,
  });

const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('arquitetura (T02)', () => {
  it('src/ respeita as regras de camadas', () => {
    const r = depcruise('src');
    expect(r.stdout + r.stderr).not.toMatch(/error/i);
    expect(r.status).toBe(0);
  }, 60_000);

  it('violação proposital (domain importando Prisma) falha com mensagem que diz o que fazer', () => {
    const r = depcruise('test/fixtures/arquitetura-violada');
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/dominio-puro/);
    expect(r.stdout).toMatch(/prisma-so-em-infra/);
    expect(r.stdout).toMatch('é função pura'); // a mensagem ensina o que fazer, não só o que está errado
  }, 60_000);

  it('SQL cru ($queryRaw/$executeRaw) só em */infra/**, em função que recebe clientId (revisão de segurança #2)', () => {
    const problemas: string[] = [];
    for (const arq of arquivos(join(raiz, 'src'))) {
      const rel = relative(raiz, arq).replaceAll('\\', '/');
      // sem comentários: a menção a $queryRaw num comentário não é uso (falso positivo encontrado na T07)
      const fonte = readFileSync(arq, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (!/\$(queryRaw|executeRaw)(Unsafe)?\b/.test(fonte)) continue;
      if (/\$(queryRaw|executeRaw)Unsafe\b/.test(fonte)) problemas.push(`${rel}: *Unsafe é proibido (injeção de SQL)`);
      // Exceção ESTREITA (ver EXCECOES_SQL): só vale se TODO o SQL cru do arquivo tocar apenas as tabelas permitidas.
      const permitidas = EXCECOES_SQL[rel];
      if (permitidas) {
        const tabelas = [...fonte.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+"?(\w+)"?/gi)].map((m) => m[1].toLowerCase());
        if (!tabelas.length || tabelas.some((t) => !permitidas.includes(t)))
          problemas.push(`${rel}: exceção só para SQL cru em ${permitidas.join(', ')} (achou: ${tabelas.join(', ')})`);
        continue;
      }
      if (!/\/infra\//.test(rel)) problemas.push(`${rel}: SQL cru fora de infra/ — mova para um repositório em infra/`);
      else if (!/clientId\s*:\s*number/.test(fonte))
        problemas.push(`${rel}: SQL cru sem parâmetro "clientId: number" — o filtro de tenant precisa estar no WHERE`);
    }
    expect(problemas).toEqual([]);
  });
});
