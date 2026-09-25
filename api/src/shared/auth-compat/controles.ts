// Controles em memória do auth-compat (RN-AUT-001..003). Limite conhecido: valem por instância da API —
// com mais de uma instância, precisam de um store compartilhado (Redis). Registrado no diário/ADR-005.

/** Lockout do login: 5 erros por e-mail+IP → bloqueio de 60 s (ThrottlesLogins do Laravel). */
export class TentativasLogin {
  static readonly MAXIMO = 5;
  static readonly BLOQUEIO_MS = 60_000;
  private readonly registros = new Map<string, { falhas: number; expiraEm: number; bloqueadoAte?: number }>();

  constructor(private readonly agora: () => number = Date.now) {}

  private chave(email: string, ip: string): string {
    return `${email.toLowerCase()}|${ip}`;
  }

  /** Segundos restantes de bloqueio, ou 0 se pode tentar. */
  segundosBloqueado(email: string, ip: string): number {
    const r = this.registros.get(this.chave(email, ip));
    if (!r) return 0;
    const t = this.agora();
    if (r.bloqueadoAte && r.bloqueadoAte > t) return Math.ceil((r.bloqueadoAte - t) / 1000);
    if (r.expiraEm <= t) {
      this.registros.delete(this.chave(email, ip));
      return 0;
    }
    if (r.falhas >= TentativasLogin.MAXIMO) {
      r.bloqueadoAte = t + TentativasLogin.BLOQUEIO_MS;
      return Math.ceil(TentativasLogin.BLOQUEIO_MS / 1000);
    }
    return 0;
  }

  /**
   * Checa e CONTA a tentativa no mesmo passo síncrono (sem await entre os dois). Devolve os segundos de bloqueio,
   * ou 0 se a tentativa pode seguir. Sem isso, N tentativas paralelas passavam todas pela checagem antes de qualquer
   * falha ser contada (achado da revisão de segurança do código, confirmado por teste). Sucesso → limpar().
   */
  reservar(email: string, ip: string): number {
    const bloqueio = this.segundosBloqueado(email, ip);
    if (bloqueio > 0) return bloqueio;
    this.registrarFalha(email, ip);
    return 0;
  }

  registrarFalha(email: string, ip: string): void {
    const k = this.chave(email, ip);
    const t = this.agora();
    const r = this.registros.get(k);
    if (!r || r.expiraEm <= t) this.registros.set(k, { falhas: 1, expiraEm: t + TentativasLogin.BLOQUEIO_MS });
    else r.falhas++;
  }

  limpar(email: string, ip: string): void {
    this.registros.delete(this.chave(email, ip));
  }
}

/** Blacklist de jti até o exp do token (logout — RN-AUT-003). */
export class ListaNegra {
  private readonly jtis = new Map<string, number>(); // jti → exp (s)

  constructor(private readonly agora: () => number = Date.now) {}

  adicionar(jti: string, exp: number): void {
    this.jtis.set(jti, exp);
  }

  contem(jti: string): boolean {
    const exp = this.jtis.get(jti);
    if (exp === undefined) return false;
    if (exp * 1000 <= this.agora()) {
      this.jtis.delete(jti);
      return false;
    }
    return true;
  }
}

/** Limite de 60 requisições por minuto (janela fixa, como o throttle:60,1 do Laravel — RN-AUT-002). */
export class LimiteRequisicoes {
  static readonly LIMITE = 60;
  static readonly JANELA_MS = 60_000;
  private readonly janelas = new Map<string, { contagem: number; reiniciaEm: number }>();

  constructor(private readonly agora: () => number = Date.now) {}

  consumir(chave: string): { permitido: boolean; restantes: number; segundosParaReiniciar: number } {
    const t = this.agora();
    let j = this.janelas.get(chave);
    if (!j || j.reiniciaEm <= t) {
      j = { contagem: 0, reiniciaEm: t + LimiteRequisicoes.JANELA_MS };
      this.janelas.set(chave, j);
    }
    j.contagem++;
    return {
      permitido: j.contagem <= LimiteRequisicoes.LIMITE,
      restantes: Math.max(0, LimiteRequisicoes.LIMITE - j.contagem),
      segundosParaReiniciar: Math.ceil((j.reiniciaEm - t) / 1000),
    };
  }
}
