// Regras de camadas do design.md §2 (T02). O "comment" é a mensagem que o agente lê ao violar:
// diz O QUE fazer, não só o que está errado.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dominio-puro',
      severity: 'error',
      comment:
        'domain/ é função pura: não importe Nest, Prisma, infra/ nem http/. Receba dados por parâmetro e devolva ' +
        'resultados; quem fala com banco é application/ (via repositório em infra/). Ver design.md §2 e §5.',
      from: { path: '(^|/)modules/[^/]+/domain/' },
      to: { path: ['(^|/)node_modules/@nestjs/', '(^|/)node_modules/@prisma/', '(^|/)modules/[^/]+/(infra|http|application)/'] },
    },
    {
      name: 'http-so-fala-com-application',
      severity: 'error',
      comment:
        'Controllers (http/) chamam só application/. Mova a regra para domain/ ou a consulta para infra/ e exponha ' +
        'pelo serviço de application/. Ver design.md §2.',
      from: { path: '(^|/)modules/[^/]+/http/' },
      to: { path: '(^|/)modules/[^/]+/infra/' },
    },
    {
      name: 'prisma-so-em-infra',
      severity: 'error',
      comment:
        'Só shared/prisma/, modules/*/infra/ e compat/infra/ importam @prisma/client — é o que garante que TODO acesso ' +
        'a dados passe pela extensão de tenant. Crie/use um repositório em infra/. Ver design.md §4 (REQ-CON-07).',
      from: { pathNot: '(^|/)(shared/prisma|modules/[^/]+/infra|compat/infra)/' },
      to: { path: '(^|/)node_modules/@prisma/client' },
    },
    {
      name: 'infra-usa-prisma-com-tenant',
      severity: 'error',
      comment:
        'Repositórios de infra/ usam o cliente COM filtro de tenant: injete PRISMA_TENANT (shared/tenant/prisma-tenant). ' +
        'O PrismaService puro não filtra por cliente e só pode ser usado em shared/ (auth, tenant). Ver design.md §4.',
      from: { path: '(^|/)(modules/[^/]+|compat)/infra/' },
      to: { path: '(^|/)shared/prisma/prisma\\.service' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      comment: 'Dependência circular. Extraia o que é comum para domain/ ou shared/.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '\\.spec\\.ts$' },
  },
};
