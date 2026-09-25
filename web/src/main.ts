import { createApp } from 'vue';
import App from './App.vue';
import { criarRotas } from './rotas';
import { removerTokenDaUrl } from './token-na-url';
import './estilo.css';

// ANTES de tudo (antes do roteador ler a URL): o ?token= do app antigo sai da barra de endereço (REQ-SIT-06)
removerTokenDaUrl();

createApp(App).use(criarRotas()).mount('#app');
