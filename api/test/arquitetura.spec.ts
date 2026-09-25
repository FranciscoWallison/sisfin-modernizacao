// T02 — sensores de arquitetura: as regras existem, pegam violação e a mensagem ensina o que fazer.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = join(__dirname, '..');
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
      const fonte = readFileSync(arq, 'utf8');
      if (!/\$(queryRaw|executeRaw)(Unsafe)?\b/.test(fonte)) continue;
      if (/\$(queryRaw|executeRaw)Unsafe\b/.test(fonte)) problemas.push(`${rel}: *Unsafe é proibido (injeção de SQL)`);
      if (!/\/infra\//.test(rel)) problemas.push(`${rel}: SQL cru fora de infra/ — mova para um repositório em infra/`);
      else if (!/clientId\s*:\s*number/.test(fonte))
        problemas.push(`${rel}: SQL cru sem parâmetro "clientId: number" — o filtro de tenant precisa estar no WHERE`);
    }
    expect(problemas).toEqual([]);
  });
});
