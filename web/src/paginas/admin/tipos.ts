// Formato do banco na API (o mesmo do GET /api/banks: logo absoluto, servido pelo nginx da mesma origem).
export interface Banco {
  id: number;
  name: string;
  logo: string;
}

export interface ListaDeBancos {
  data: Banco[];
  meta: { pagination: { total: number; current_page: number; total_pages: number } };
}

export const ACESSO_NEGADO = 'Acesso negado: esta área é só para administradores.';
