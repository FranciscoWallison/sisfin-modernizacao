import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import AdminBancoForm from './paginas/admin/AdminBancoForm.vue';
import AdminBancos from './paginas/admin/AdminBancos.vue';
import Assinar from './paginas/assinatura/Assinar.vue';
import AssinaturaConfirmada from './paginas/assinatura/AssinaturaConfirmada.vue';
import Cadastro from './paginas/Cadastro.vue';
import Inicio from './paginas/Inicio.vue';
import Login from './paginas/Login.vue';
import MinhaConta from './paginas/MinhaConta.vue';
import NaoEncontrada from './paginas/NaoEncontrada.vue';

// As mesmas URLs do site do legado (routes/web.php), menos o convite, que não é migrado (REQ-SIT-07 / DUV-SIT-001).
export const rotas: RouteRecordRaw[] = [
  { path: '/', component: Inicio },
  { path: '/login', component: Login },
  { path: '/register', component: Cadastro },
  { path: '/my-financial', component: MinhaConta },
  // Admin de bancos (ADR-010). /admin/register e /admin/password/* NÃO existem (REQ-ADB-02, 07): "não encontrada"
  { path: '/admin/banks', component: AdminBancos },
  { path: '/admin/banks/novo', component: AdminBancoForm },
  { path: '/admin/banks/:id(\\d+)', component: AdminBancoForm },
  // Assinatura (ADR-011): o Stripe no lugar da Iugu. A rota pública de teste do e-mail não existe (RN-ASS-008)
  { path: '/subscriptions/create', component: Assinar },
  { path: '/subscriptions/successfully', component: AssinaturaConfirmada },
  { path: '/:caminho(.*)*', component: NaoEncontrada },
];

export const criarRotas = () => createRouter({ history: createWebHistory(), routes: rotas });
