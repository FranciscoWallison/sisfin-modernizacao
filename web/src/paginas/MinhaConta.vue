<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { chamar } from '../api';
import { destinoSeguro, nomeDoStatus, type Assinatura } from '../assinatura';
import { sair, tokenAtual, URL_DO_APP, type Usuario } from '../sessao';

// /my-financial: o app antigo abre esta URL com ?token= — o main.ts já o apagou da barra; aqui só se usa o token do
// localStorage (mesma origem). No legado a página respondia "oi"; o convite não é migrado (REQ-SIT-07).
// Mostra também a assinatura da empresa e o portal do Stripe (REQ-ASS-06).
const router = useRouter();
const usuario = ref<Usuario | null>(null);
const assinatura = ref<Assinatura | null>(null);
const geral = ref<string | null>(null);

onMounted(async () => {
  const token = tokenAtual();
  const r = token ? await chamar<Usuario>('GET', '/user', { token }) : null;
  if (!r || !r.ok) {
    sair();
    await router.replace('/login');
    return;
  }
  usuario.value = r.dados;
  const a = await chamar<{ data: Assinatura }>('GET', '/subscription', { token });
  assinatura.value = a.ok ? a.dados.data : null;
});

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

async function gerenciar() {
  geral.value = null;
  const r = await chamar<{ url: string }>('POST', '/subscriptions/portal', { token: tokenAtual() });
  const destino = r.ok ? destinoSeguro(r.dados.url, window.location.origin) : null;
  if (destino) return window.location.assign(destino);
  geral.value = 'Não foi possível abrir o gerenciamento da assinatura. Tente de novo.';
}

async function encerrar() {
  const token = tokenAtual();
  if (token) await chamar('POST', '/logout', { token }); // blacklist do token (RN-AUT-003)
  sair();
  await router.replace('/login');
}
</script>

<template>
  <section class="cartao">
    <h1>Minha conta</h1>
    <p v-if="usuario" data-teste="usuario">{{ usuario.name }} — {{ usuario.email }}</p>
    <p v-else>Carregando…</p>
    <template v-if="usuario">
      <h2>Assinatura</h2>
      <p v-if="assinatura" data-teste="assinatura">
        {{ nomeDoStatus(assinatura.status) }}<template v-if="assinatura.plan"> — {{ assinatura.plan.name }}</template>
        <br />
        <template v-if="assinatura.cancel_at_period_end">Termina em</template><template v-else>Renova em</template>
        {{ dataBR(assinatura.current_period_end) }}
      </p>
      <p v-else data-teste="assinatura">Sua empresa ainda não tem assinatura.</p>
      <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
    </template>
    <div class="acoes">
      <a :href="URL_DO_APP" class="botao">Ir para o app</a>
      <button v-if="assinatura" type="button" @click="gerenciar">Gerenciar assinatura</button>
      <RouterLink v-else-if="usuario" to="/subscriptions/create" class="botao">Assinar</RouterLink>
      <RouterLink v-if="usuario?.role === 'admin'" to="/admin/banks" class="botao">Administração de bancos</RouterLink>
      <button type="button" @click="encerrar">Sair</button>
    </div>
  </section>
</template>
