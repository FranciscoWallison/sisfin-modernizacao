// Controles em memória do auth-compat (RN-AUT-001..003). Limite conhecido: valem por instância da API —
// com mais de uma instância, precisam de um store compartilhado (Redis). Registrado no diário/ADR-005.
//
// Todos os mapas são VARRIDOS periodicamente (revisão de segurança do site, S2): antes, uma entrada só saía quando a
// mesma chave voltava — chaves que nunca se repetem (e-mails aleatórios, IPs) ficavam para sempre na memória.

/** Remove as entradas expiradas no máximo uma vez por `intervaloMs` (custo amortizado nas operações). */
class Varredura<V> {
  private proxima = 0;

  constructor(
    private readonly mapa: Map<string, V>,
    private readonly expirou: (v: V, agora: number) => boolean,
    private readonly intervaloMs: number,
  ) {}

  talvez(agora: number): void {
    if (agora < this.proxima) return;
    this.proxima = agora + this.intervaloMs;
    for (const [k, v] of this.mapa) if (this.expirou(v, agora)) this.mapa.delete(k);
  }
}

/** Lockout do login: 5 erros por e-mail+IP → bloqueio de 60 s (ThrottlesLogins do Laravel). */
export class TentativasLogin {
  static readonly MAXIMO = 5;
  static readonly BLOQUEIO_MS = 60_000;
  private readonly registros = new Map<string, { falhas: number; expiraEm: number; bloqueadoAte?: number }>();
  private readonly varredura = new Varredura(
    this.registros,
    (r, t) => r.expiraEm <= t && (!r.bloqueadoAte || r.bloqueadoAte <= t),
    TentativasLogin.BLOQUEIO_MS,
  );

  constructor(private readonly agora: () => number = Date.now) {}

  /** Entradas em memória (para teste e observabilidade). */
  get tamanho(): number {
    return this.registros.size;
  }

  private chave(email: string, ip: string): string {
    return `${email.toLowerCase()}|${ip}`;
  }

  /** Segundos restantes de bloqueio, ou 0 se pode tentar. */
  segundosBloqueado(email: string, ip: string): number {
    const t = this.agora();
    this.varredura.talvez(t);
    const r = this.registros.get(this.chave(email, ip));
    if (!r) return 0;
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
  private readonly varredura = new Varredura(this.jtis, (exp, t) => exp * 1000 <= t, 60_000);

  constructor(private readonly agora: () => number = Date.now) {}

  get tamanho(): number {
    return this.jtis.size;
  }

  adicionar(jti: string, exp: number): void {
    this.varredura.talvez(this.agora());
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

/**
 * Limite de requisições por janela fixa. Padrão: 60 por minuto (throttle:60,1 do Laravel — RN-AUT-002). O cadastro
 * público usa uma instância própria, bem mais baixa por hora (revisão de segurança do site, S3).
 */
export class LimiteRequisicoes {
  static readonly LIMITE = 60;
  static readonly JANELA_MS = 60_000;
  private readonly janelas = new Map<string, { contagem: number; reiniciaEm: number }>();
  private readonly varredura: Varredura<{ contagem: number; reiniciaEm: number }>;

  constructor(
    private readonly agora: () => number = Date.now,
    readonly limite: number = LimiteRequisicoes.LIMITE,
    private readonly janelaMs: number = LimiteRequisicoes.JANELA_MS,
  ) {
    this.varredura = new Varredura(this.janelas, (j, t) => j.reiniciaEm <= t, janelaMs);
  }

  get tamanho(): number {
    return this.janelas.size;
  }

  consumir(chave: string): { permitido: boolean; restantes: number; segundosParaReiniciar: number } {
    const t = this.agora();
    this.varredura.talvez(t);
    let j = this.janelas.get(chave);
    if (!j || j.reiniciaEm <= t) {
      j = { contagem: 0, reiniciaEm: t + this.janelaMs };
      this.janelas.set(chave, j);
    }
    j.contagem++;
    return {
      permitido: j.contagem <= this.limite,
      restantes: Math.max(0, this.limite - j.contagem),
      segundosParaReiniciar: Math.ceil((j.reiniciaEm - t) / 1000),
    };
  }
}
