<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { chamar } from '../api';
import { sair, tokenAtual, URL_DO_APP, type Usuario } from '../sessao';

// /my-financial: o app antigo abre esta URL com ?token= — o main.ts já o apagou da barra; aqui só se usa o token do
// localStorage (mesma origem). No legado a página respondia "oi"; o convite não é migrado (REQ-SIT-07).
const router = useRouter();
const usuario = ref<Usuario | null>(null);

onMounted(async () => {
  const token = tokenAtual();
  const r = token ? await chamar<Usuario>('GET', '/user', { token }) : null;
  if (!r || !r.ok) {
    sair();
    await router.replace('/login');
    return;
  }
  usuario.value = r.dados;
});

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
    <div class="acoes">
      <a :href="URL_DO_APP" class="botao">Ir para o app</a>
      <button type="button" @click="encerrar">Sair</button>
    </div>
  </section>
</template>
