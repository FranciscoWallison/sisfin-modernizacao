/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const componente: DefineComponent<object, object, unknown>;
  export default componente;
}
interface ImportMetaEnv {
  /** Base da API, fixada no build como o SPA faz (ex.: http://localhost:3300/api). */
  readonly VITE_API_URL: string;
}
