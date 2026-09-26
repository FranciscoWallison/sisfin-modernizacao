<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { chamar } from '../../api';
import { acessoAdmin, sair, tokenAtual } from '../../sessao';
import { ACESSO_NEGADO, type Banco, type ListaDeBancos } from './tipos';

// /admin/banks (REQ-ADB-07): lista de 5 por página, com logo, editar e excluir. Banco em uso → a mensagem da API.
const route = useRoute();
const router = useRouter();
const bancos = ref<Banco[]>([]);
const pagina = ref(1);
const totalPaginas = ref(1);
const negado = ref(false);
const geral = ref<string | null>(null);

async function tratarErro(status: number, mensagem: string | null) {
  if (status === 401) {
    sair();
    await router.replace('/login');
  } else if (status === 403) negado.value = true;
  else geral.value = mensagem;
}

async function carregar() {
  const r = await chamar<ListaDeBancos>('GET', `/admin/banks?page=${Number(route.query.page) || 1}`, { token: tokenAtual() });
  if (!r.ok) return tratarErro(r.status, r.geral);
  bancos.value = r.dados.data;
  pagina.value = r.dados.meta.pagination.current_page;
  totalPaginas.value = Math.max(1, r.dados.meta.pagination.total_pages);
}

async function excluir(b: Banco) {
  if (!window.confirm(`Excluir o banco "${b.name}"?`)) return;
  geral.value = null;
  const r = await chamar('DELETE', `/admin/banks/${b.id}`, { token: tokenAtual() });
  if (!r.ok) return tratarErro(r.status, r.geral);
  await carregar();
}

onMounted(async () => {
  const acesso = acessoAdmin();
  if (acesso === 'login') return router.replace('/login');
  if (acesso === 'negado') return (negado.value = true);
  await carregar();
});
watch(
  () => route.query.page,
  () => !negado.value && carregar(),
);
</script>

<template>
  <section class="cartao">
    <h1>Bancos</h1>
    <p v-if="negado" class="erro-geral" role="alert">{{ ACESSO_NEGADO }}</p>
    <template v-else>
      <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
      <table class="tabela">
        <thead>
          <tr><th>Logo</th><th>Nome</th><th>Ações</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in bancos" :key="b.id" :data-banco="b.name">
            <td><img :src="b.logo" :alt="`Logo de ${b.name}`" width="40" height="40" /></td>
            <td>{{ b.name }}</td>
            <td>
              <div class="acoes">
                <RouterLink :to="`/admin/banks/${b.id}`">Editar</RouterLink>
                <button type="button" class="perigo" @click="excluir(b)">Excluir</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <nav class="acoes" aria-label="Paginação">
        <RouterLink v-if="pagina > 1" :to="`/admin/banks?page=${pagina - 1}`">Anterior</RouterLink>
        <span>Página {{ pagina }} de {{ totalPaginas }}</span>
        <RouterLink v-if="pagina < totalPaginas" :to="`/admin/banks?page=${pagina + 1}`">Próxima</RouterLink>
      </nav>
      <div class="acoes">
        <RouterLink to="/admin/banks/novo" class="botao">Novo banco</RouterLink>
        <RouterLink to="/my-financial">Minha conta</RouterLink>
      </div>
    </template>
  </section>
</template>
