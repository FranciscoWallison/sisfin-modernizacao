<script setup lang="ts">
import { tokenAtual, URL_DO_APP } from '../sessao';

const logado = tokenAtual() !== null;
</script>

<template>
  <section class="cartao">
    <h1>SisFin</h1>
    <p>Controle financeiro: contas a pagar e a receber, contas bancárias, extrato e fluxo de caixa.</p>
    <div class="acoes">
      <a v-if="logado" :href="URL_DO_APP" class="botao">Ir para o app</a>
      <template v-else>
        <RouterLink to="/login" class="botao">Entrar</RouterLink>
        <RouterLink to="/register">Criar conta</RouterLink>
      </template>
    </div>
  </section>
</template>
