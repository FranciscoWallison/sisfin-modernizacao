<script setup lang="ts">
import { reactive, ref } from 'vue';
import { chamar, type ErrosPorCampo } from '../api';
import { ENTRADA_DO_APP, entrar } from '../sessao';

// REQ-SIT-04: login pela API existente (lockout e rate limit dela — RN-AUT-*); sem sessão web, sem cookie.
const form = reactive({ email: '', password: '' });
const campos = ref<ErrosPorCampo>({});
const geral = ref<string | null>(null);
const enviando = ref(false);

async function enviar() {
  enviando.value = true;
  campos.value = {};
  geral.value = null;
  const r = await chamar<{ token: string }>('POST', '/access_token', { corpo: { ...form } });
  if (r.ok) {
    if (await entrar(r.dados.token)) {
      window.location.assign(ENTRADA_DO_APP);
      return;
    }
    // token emitido, mas /api/user falhou: sem isto a tela ficava muda (revisão de segurança do site, S11)
    geral.value = 'Não foi possível abrir a sessão. Tente de novo.';
    enviando.value = false;
    return;
  }
  if (!r.ok) {
    campos.value = r.campos;
    geral.value = r.geral;
  }
  enviando.value = false;
}
</script>

<template>
  <section class="cartao">
    <h1>Entrar</h1>
    <form novalidate @submit.prevent="enviar">
      <label>E-Mail
        <input v-model="form.email" name="email" type="email" autocomplete="username" :aria-invalid="!!campos.email" />
      </label>
      <p v-for="m in campos.email" :key="m" class="erro" data-campo="email">{{ m }}</p>
      <label>Senha
        <input v-model="form.password" name="password" type="password" autocomplete="current-password" :aria-invalid="!!campos.password" />
      </label>
      <p v-for="m in campos.password" :key="m" class="erro" data-campo="password">{{ m }}</p>
      <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
      <div class="acoes">
        <button type="submit" :disabled="enviando">Login</button>
        <RouterLink to="/register">Registre-se aqui</RouterLink>
      </div>
    </form>
  </section>
</template>
