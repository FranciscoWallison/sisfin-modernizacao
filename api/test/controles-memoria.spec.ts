// S2 (revisão de segurança do site) — os mapas em memória do auth-compat não podem crescer para sempre com chaves que
// nunca se repetem (e-mails aleatórios, IPs, jtis). Relógio falso: nada de esperar de verdade.
import { LimiteRequisicoes, ListaNegra, TentativasLogin } from '../src/shared/auth-compat/controles';

describe('varredura dos controles em memória (S2)', () => {
  it('TentativasLogin: 1.000 e-mails distintos somem depois que expiram', () => {
    let agora = 1_000_000;
    const t = new TentativasLogin(() => agora);
    for (let i = 0; i < 1000; i++) t.reservar(`lixo${i}@x.com`, '1.2.3.4');
    expect(t.tamanho).toBe(1000);
    agora += 2 * TentativasLogin.BLOQUEIO_MS;
    t.reservar('outro@x.com', '1.2.3.4'); // qualquer operação dispara a varredura
    expect(t.tamanho).toBe(1);
  });

  it('TentativasLogin: bloqueio ativo NÃO é varrido antes da hora (o lockout continua valendo)', () => {
    let agora = 1_000_000;
    const t = new TentativasLogin(() => agora);
    for (let i = 0; i < 6; i++) t.reservar('alvo@x.com', 'ip');
    expect(t.segundosBloqueado('alvo@x.com', 'ip')).toBeGreaterThan(0);
    agora += 30_000;
    t.reservar('outro@x.com', 'ip');
    expect(t.segundosBloqueado('ALVO@x.com', 'ip')).toBeGreaterThan(0); // mesma chave em maiúsculas
  });

  it('LimiteRequisicoes: janelas de 1.000 IPs somem depois da janela; o limite é parametrizável', () => {
    let agora = 0;
    const l = new LimiteRequisicoes(() => agora, 3, 3_600_000);
    for (let i = 0; i < 1000; i++) l.consumir(`ip:${i}`);
    expect(l.tamanho).toBe(1000);
    expect([1, 2, 3, 4].map(() => l.consumir('ip:x').permitido)).toEqual([true, true, true, false]);
    agora += 3_600_001;
    l.consumir('ip:y');
    expect(l.tamanho).toBe(1);
  });

  it('ListaNegra: jtis vencidos somem', () => {
    let agora = 1_000_000;
    const n = new ListaNegra(() => agora);
    for (let i = 0; i < 100; i++) n.adicionar(`jti${i}`, Math.floor(agora / 1000) + 60);
    agora += 120_000;
    n.adicionar('novo', Math.floor(agora / 1000) + 60);
    expect(n.tamanho).toBe(1);
  });
});
