<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { chamar } from '../../api';
import { estaAtiva, type Assinatura } from '../../assinatura';
import { ENTRADA_DO_APP, tokenAtual } from '../../sessao';

// /subscriptions/successfully (REQ-ASS-06): a volta do Checkout NÃO prova pagamento — quem confirma é o webhook
// assinado. A tela consulta o estado por alguns segundos e mostra "processando" até lá.
const router = useRouter();
const situacao = ref<'processando' | 'ativa' | 'demorando'>('processando');
let tentativas = 0;
let temporizador: ReturnType<typeof setTimeout> | undefined;

async function consultar() {
  const r = await chamar<{ data: Assinatura }>('GET', '/subscription', { token: tokenAtual() });
  if (r.ok && estaAtiva(r.dados.data.status)) {
    situacao.value = 'ativa';
    return;
  }
  if (++tentativas >= 20) {
    situacao.value = 'demorando';
    return;
  }
  temporizador = setTimeout(consultar, 1_000);
}

onMounted(() => {
  if (!tokenAtual()) return router.replace('/login');
  void consultar();
});
onUnmounted(() => clearTimeout(temporizador));
</script>

<template>
  <section class="cartao">
    <h1>Assinatura</h1>
    <p v-if="situacao === 'processando'" data-teste="situacao">Pagamento em processamento…</p>
    <p v-else-if="situacao === 'ativa'" data-teste="situacao">Assinatura ativa! Obrigado.</p>
    <p v-else data-teste="situacao">O pagamento ainda está sendo confirmado. Veja o estado em "Minha conta" daqui a pouco.</p>
    <div class="acoes">
      <a v-if="situacao === 'ativa'" :href="ENTRADA_DO_APP" class="botao">Ir para o app</a>
      <RouterLink to="/my-financial">Minha conta</RouterLink>
    </div>
  </section>
</template>
