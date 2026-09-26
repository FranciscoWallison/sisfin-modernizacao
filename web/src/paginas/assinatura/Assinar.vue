<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { chamar } from '../../api';
import { destinoSeguro, estaAtiva, reais, type Assinatura, type Plano } from '../../assinatura';
import { sair, tokenAtual } from '../../sessao';

// /subscriptions/create (REQ-ASS-06): o plano e "Assinar" → Stripe Checkout (página do Stripe; o cartão nunca passa
// por aqui). O legado carregava a iugu.js em modo de teste fixo, com um cartão pré-preenchido (RN-ASS-003).
const router = useRouter();
const plano = ref<Plano | null>(null);
const jaAssina = ref(false);
const geral = ref<string | null>(null);
const enviando = ref(false);

onMounted(async () => {
  const token = tokenAtual();
  if (!token) return router.replace('/login');
  const [planos, atual] = await Promise.all([
    chamar<{ data: Plano[] }>('GET', '/plans', { token }),
    chamar<{ data: Assinatura }>('GET', '/subscription', { token }),
  ]);
  if (!planos.ok && planos.status === 401) {
    sair();
    return router.replace('/login');
  }
  if (planos.ok) plano.value = planos.dados.data[0] ?? null;
  jaAssina.value = atual.ok && estaAtiva(atual.dados.data.status);
});

async function assinar() {
  enviando.value = true;
  geral.value = null;
  const r = await chamar<{ url: string }>('POST', '/subscriptions/checkout', { token: tokenAtual() });
  if (r.ok) {
    const destino = destinoSeguro(r.dados.url, window.location.origin);
    if (destino) return window.location.assign(destino);
    geral.value = 'Não foi possível abrir o pagamento. Tente de novo.';
  } else {
    geral.value = r.geral;
  }
  enviando.value = false;
}
</script>

<template>
  <section class="cartao">
    <h1>Assinatura</h1>
    <template v-if="plano">
      <h2 data-teste="plano">{{ plano.name }}</h2>
      <p>{{ plano.description }}</p>
      <p class="preco" data-teste="preco">{{ reais(plano.value) }} por mês</p>
    </template>
    <p v-if="jaAssina">Sua empresa já tem uma assinatura ativa.</p>
    <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
    <div class="acoes">
      <button v-if="!jaAssina" type="button" :disabled="enviando || !plano" @click="assinar">Assinar</button>
      <RouterLink to="/my-financial">Minha conta</RouterLink>
    </div>
    <p class="nota">O pagamento é feito na página segura do Stripe, com cartão de crédito.</p>
  </section>
</template>
