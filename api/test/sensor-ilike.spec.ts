// Sensor (revisão de segurança do site, S1): no Postgres, o Prisma traduz `equals` + `mode: 'insensitive'` para ILIKE
// SEM escapar % e _ — o login com o e-mail "%" entrava como o 1º usuário. Igualdade sem diferenciar maiúsculas se faz
// com lower(coluna) = lower($1). (`contains` + insensitive, usado nas buscas do próprio cliente, é outro caso.)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });

it('nenhum `equals` com `mode: \'insensitive\'` no código da API', () => {
  const culpados = arquivos(join(__dirname, '..', 'src')).filter((f) =>
    /equals\s*:[^}]*mode\s*:\s*['"]insensitive['"]|mode\s*:\s*['"]insensitive['"][^}]*equals\s*:/.test(readFileSync(f, 'utf8')),
  );
  expect(culpados).toEqual([]);
});
