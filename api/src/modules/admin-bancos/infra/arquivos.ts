import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG } from '../../../shared/auth-compat/contexto';
import type { Config } from '../../../shared/config/config';
import { logoRemovivel, TipoImagem } from '../domain/imagem';

/**
 * Logos no volume de arquivos (ADR-010): `<ARQUIVOS_DIR>/banks/imagens/<nome>` — o mesmo caminho relativo do legado,
 * servido pelo nginx em /storage/banks/imagens/. Nome aleatório com a extensão do tipo DETECTADO; `wx` falha se o
 * arquivo já existir: nunca sobrescreve o padrão nem o logo de outro banco (REQ-ADB-04).
 */
@Injectable()
export class ArquivosDeLogo {
  private readonly log = new Logger('ArquivosDeLogo');
  private readonly dir: string;

  constructor(@Inject(CONFIG) config: Config) {
    this.dir = join(config.arquivosDir, 'banks', 'imagens');
  }

  async gravar(conteudo: Uint8Array, tipo: TipoImagem): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const nome = `${randomBytes(16).toString('hex')}.${tipo}`;
    await writeFile(join(this.dir, nome), conteudo, { flag: 'wx', mode: 0o644 });
    return nome;
  }

  /** Remove sem derrubar a operação (o banco já gravou): arquivo ausente é normal; outro erro só vai para o log. */
  async remover(nome: string): Promise<void> {
    if (!logoRemovivel(nome)) return; // padrão, ou nome que sairia do diretório
    try {
      await unlink(join(this.dir, nome));
    } catch (e) {
      const codigo = (e as { code?: unknown }).code;
      if (codigo !== 'ENOENT') this.log.warn(`logo não removido (${String(codigo)}): ${nome}`);
    }
  }
}
