// Aprovação de tasks.md amarrada ao conteúdo (ideia do Shopify): a 1ª linha guarda o hash
// do restante do arquivo. Se o plano mudar depois de aprovado, o hash não bate e a aprovação cai.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const caminhoTasks = (raiz, modulo) => join(raiz, '.specs', 'novo', modulo, 'tasks.md');

export const hashDoPlano = (texto) =>
  createHash('sha256')
    .update(texto.replace(/\r\n/g, '\n').split('\n').slice(1).join('\n').trim())
    .digest('hex')
    .slice(0, 12);

// → { ok: boolean, motivo: string }
export function verificarAprovacao(raiz, modulo) {
  const arq = caminhoTasks(raiz, modulo);
  if (!existsSync(arq)) return { ok: false, motivo: `não existe ${relativo(arq, raiz)}. Rode /spec-nova ${modulo} primeiro.` };
  const texto = readFileSync(arq, 'utf8');
  const cabecalho = texto.split(/\r?\n/, 1)[0];
  const m = cabecalho.match(/^Status:\s*aprovado\b.*Hash:\s*([0-9a-f]{12})/i);
  if (!m) return { ok: false, motivo: `${relativo(arq, raiz)} não está aprovado (1ª linha: "${cabecalho}"). Peça aprovação ao humano.` };
  const atual = hashDoPlano(texto);
  if (m[1] !== atual)
    return {
      ok: false,
      motivo: `${relativo(arq, raiz)} mudou depois de aprovado (hash aprovado ${m[1]}, atual ${atual}). A aprovação caiu: peça nova aprovação.`,
    };
  return { ok: true, motivo: 'aprovado' };
}

const relativo = (arq, raiz) => arq.slice(raiz.length + 1).replaceAll('\\', '/');
