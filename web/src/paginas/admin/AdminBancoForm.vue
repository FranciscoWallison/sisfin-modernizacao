<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { chamar, type ErrosPorCampo } from '../../api';
import { acessoAdmin, sair, tokenAtual } from '../../sessao';
import { ACESSO_NEGADO, type Banco } from './tipos';

// /admin/banks/novo e /admin/banks/:id (REQ-ADB-03, 07): nome + logo (PNG, JPEG ou WebP até 1 MB — quem decide é a
// API, pelo conteúdo). Sem arquivo escolhido na edição, o logo atual fica. Envio multipart (FormData).
const route = useRoute();
const router = useRouter();
const id = computed(() => (route.params.id ? Number(route.params.id) : null));
const nome = ref('');
const logoAtual = ref<string | null>(null);
const arquivo = ref<File | null>(null);
const campos = ref<ErrosPorCampo>({});
const geral = ref<string | null>(null);
const negado = ref(false);
const enviando = ref(false);

async function tratarErro(status: number, mensagem: string | null) {
  if (status === 401) {
    sair();
    await router.replace('/login');
  } else if (status === 403) negado.value = true;
  else geral.value = mensagem;
}

onMounted(async () => {
  const acesso = acessoAdmin();
  if (acesso === 'login') return router.replace('/login');
  if (acesso === 'negado') return (negado.value = true);
  if (id.value === null) return;
  const r = await chamar<{ data: Banco }>('GET', `/admin/banks/${id.value}`, { token: tokenAtual() });
  if (!r.ok) return tratarErro(r.status, r.geral);
  nome.value = r.dados.data.name;
  logoAtual.value = r.dados.data.logo;
});

function escolher(e: Event) {
  arquivo.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}

async function salvar() {
  enviando.value = true;
  campos.value = {};
  geral.value = null;
  const corpo = new FormData();
  corpo.append('name', nome.value);
  if (arquivo.value) corpo.append('logo', arquivo.value);
  const r =
    id.value === null
      ? await chamar('POST', '/admin/banks', { corpo, token: tokenAtual() })
      : await chamar('PUT', `/admin/banks/${id.value}`, { corpo, token: tokenAtual() });
  enviando.value = false;
  if (r.ok) return router.push('/admin/banks');
  if (Object.keys(r.campos).length) campos.value = r.campos;
  else await tratarErro(r.status, r.geral);
}
</script>

<template>
  <section class="cartao">
    <h1>{{ id === null ? 'Novo banco' : 'Editar banco' }}</h1>
    <p v-if="negado" class="erro-geral" role="alert">{{ ACESSO_NEGADO }}</p>
    <form v-else novalidate @submit.prevent="salvar">
      <label>Nome <input v-model="nome" name="name" :aria-invalid="!!campos.name" /></label>
      <p v-for="m in campos.name" :key="m" class="erro" data-campo="name">{{ m }}</p>
      <p v-if="logoAtual" class="logo-atual">Logo atual: <img :src="logoAtual" alt="Logo atual" width="40" height="40" /></p>
      <label
        >Logo (PNG, JPEG ou WebP, até 1 MB)
        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" :aria-invalid="!!campos.logo" @change="escolher" />
      </label>
      <p v-for="m in campos.logo" :key="m" class="erro" data-campo="logo">{{ m }}</p>
      <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
      <div class="acoes">
        <button type="submit" :disabled="enviando">Salvar</button>
        <RouterLink to="/admin/banks">Voltar</RouterLink>
      </div>
    </form>
  </section>
</template>
