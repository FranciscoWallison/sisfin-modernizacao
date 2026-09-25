import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
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
  { path: '/:caminho(.*)*', component: NaoEncontrada },
];

export const criarRotas = () => createRouter({ history: createWebHistory(), routes: rotas });
