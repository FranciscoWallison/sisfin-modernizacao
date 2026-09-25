# Regras de negócio — módulo `auth` (AS-IS, parcial)

> Levantadas em 25/09/2026 a partir da revisão de segurança do módulo `contas` (`docs/revisoes/2026-09-25-security-contas.md`):
> são controles do legado que o `auth-compat` do sistema novo não pode perder. O módulo `auth` completo vem depois.

### RN-AUT-001 — Bloqueio após 5 tentativas de login erradas
- **Regra:** 5 tentativas erradas para o mesmo e-mail + IP → a 6ª responde **403** `"Too many login attempts. Please try again in 60 seconds."` por 60 s. Outro e-mail no mesmo IP continua podendo logar.
- **Evidência:** `legacy/app/Http/Controllers/Api/AuthController.php:30-34` (`AuthenticatesUsers` → `hasTooManyLoginAttempts`) e `:67-78` (`sendLockoutResponse` com 403)
- **Sonda:** e-mail inexistente, senha errada ×7 → 400 ×5, 403 ×2; `cliente1@user.com` logo depois → 200 ✅
- **Confiança:** alta

### RN-AUT-002 — Limite de 60 requisições por minuto na API
- **Regra:** todo o grupo `api` passa por `throttle:60,1`; autenticado, o limite é por usuário. Cabeçalhos `X-RateLimit-Limit` / `X-RateLimit-Remaining`.
- **Evidência:** `legacy/app/Http/Kernel.php:38`
- **Sonda:** `GET /api/test_auth` → `X-RateLimit-Limit: 60`, `X-RateLimit-Remaining: 59` com token novo ✅
- **Confiança:** alta

### RN-AUT-003 — JWT HS256 de 60 min com `jti` e blacklist no logout
- **Regra:** o token tem `iss, iat, exp (iat+3600), nbf, jti, sub (id do usuário), prv` e a claim `user {id, name, email}`. **Não tem `client_id`.** `POST /api/logout` põe o `jti` na blacklist: o token deixa de valer antes de expirar.
- **Evidência:** `legacy/config/jwt.php:103` (ttl), `:136` (HS256), `:186` (`blacklist_enabled`); `legacy/app/Models/User.php:58-66` (claims)
- **Sonda:** payload decodificado do token de `cliente1` ✅; logout/reuso no caso `paridade/auth/RN-AUT-001-a-003-sessao.json`
- **Confiança:** alta
- **Observação:** nome e e-mail vão em claro no payload (LGPD — ver revisão de segurança, achado 12)
