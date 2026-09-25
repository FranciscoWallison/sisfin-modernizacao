<script setup lang="ts">
import { reactive, ref } from 'vue';
import { chamar, type ErrosPorCampo } from '../api';
import { ENTRADA_DO_APP, entrar } from '../sessao';

// REQ-SIT-01/05: POST /api/register; com o token, grava a sessão compartilhada e vai para o app (DUV-SIT-004).
// Os nomes dos campos e as mensagens são os do formulário do legado (site/auth/register.blade.php).
const form = reactive({ name: '', email: '', password: '', password_confirmation: '', client: { name: '', email: '' } });
const campos = ref<ErrosPorCampo>({});
const geral = ref<string | null>(null);
const enviando = ref(false);

async function enviar() {
  enviando.value = true;
  campos.value = {};
  geral.value = null;
  const r = await chamar<{ token: string }>('POST', '/register', { corpo: form });
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
    geral.value = Object.keys(r.campos).length ? null : r.geral;
  }
  enviando.value = false;
}
</script>

<template>
  <section class="cartao">
    <h1>Criar conta</h1>
    <form novalidate @submit.prevent="enviar">
      <fieldset>
        <legend>Seus dados</legend>
        <label>Nome <input v-model="form.name" name="name" autocomplete="name" :aria-invalid="!!campos.name" /></label>
        <p v-for="m in campos.name" :key="m" class="erro" data-campo="name">{{ m }}</p>
        <label>E-mail <input v-model="form.email" name="email" type="email" autocomplete="email" :aria-invalid="!!campos.email" /></label>
        <p v-for="m in campos.email" :key="m" class="erro" data-campo="email">{{ m }}</p>
        <label>Senha <input v-model="form.password" name="password" type="password" autocomplete="new-password" :aria-invalid="!!campos.password" /></label>
        <p v-for="m in campos.password" :key="m" class="erro" data-campo="password">{{ m }}</p>
        <label>Confirmar senha <input v-model="form.password_confirmation" name="password_confirmation" type="password" autocomplete="new-password" /></label>
      </fieldset>
      <fieldset>
        <legend>Sua empresa</legend>
        <label>Nome <input v-model="form.client.name" name="client[name]" :aria-invalid="!!campos['client.name']" /></label>
        <p v-for="m in campos['client.name']" :key="m" class="erro" data-campo="client.name">{{ m }}</p>
        <label>E-mail <input v-model="form.client.email" name="client[email]" type="email" :aria-invalid="!!campos['client.email']" /></label>
        <p v-for="m in campos['client.email']" :key="m" class="erro" data-campo="client.email">{{ m }}</p>
      </fieldset>
      <p v-if="geral" class="erro-geral" role="alert">{{ geral }}</p>
      <div class="acoes">
        <button type="submit" :disabled="enviando">Criar conta</button>
        <RouterLink to="/login">Já tenho conta</RouterLink>
      </div>
    </form>
  </section>
</template>
