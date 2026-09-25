# Compila o SPA do legado (Vue 1 + webpack 1) — o bundle nunca foi versionado no repositório original.
# O código vem de legacy/ (somente leitura); a URL da API é fixada no build (como o "gulp spa-config" fazia).
# Node 8 em vez do 6.8.1 do package.json: sem lockfile, as dependências transitivas de hoje exigem um pouco mais
# do que o Node 6 oferece; webpack 1 e babel 6 funcionam igual no 8.
FROM node:8 AS build
WORKDIR /spa
COPY legacy/package.json legacy/.babelrc legacy/webpack.config.js legacy/spa.config.js ./
RUN npm install --loglevel=error && npm install --no-save --loglevel=error babel-loader@6 babel-core@6 babel-preset-es2015@6 vue-loader@8 vue-html-loader@1 vue-style-loader@1 css-loader@0.28 babel-plugin-transform-runtime@6 babel-runtime@6
COPY legacy/resources ./resources
ARG API_URL
# Equivalente à task "spa-config" do gulpfile: gera resources/assets/spa/js/config.js a partir do spa.config.js
RUN test -n "$API_URL" \
 && node -e "const c=require('./spa.config.js');require('fs').writeFileSync('resources/assets/spa/js/config.js','module.exports = '+JSON.stringify(c,null,2)+';\n')" \
 && cat resources/assets/spa/js/config.js \
 && node_modules/.bin/webpack --config webpack.config.js --bail



# Servidor estático: a MESMA tela do legado, apontando para a API definida em API_URL
FROM nginx:1.27-alpine AS servidor
ARG ROTULO="SisFin"
ARG COR="#455a64"
COPY docker/spa/nginx.conf /etc/nginx/conf.d/default.conf
COPY legacy/public/css /usr/share/nginx/html/css
COPY legacy/public/fonts /usr/share/nginx/html/fonts
COPY legacy/public/img /usr/share/nginx/html/img
COPY --from=build /spa/public/build /usr/share/nginx/html/build
COPY docker/spa/index.html /usr/share/nginx/html/app/index.html
RUN sed -i "s|__ROTULO__|${ROTULO}|g; s|__COR__|${COR}|g" /usr/share/nginx/html/app/index.html

# Site novo (Vue 3 + Vite, web/) — ADR-009: cadastro, login e minha conta, na MESMA origem do app
FROM node:22-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG API_URL
RUN test -n "$API_URL" && VITE_API_URL="$API_URL" npm test && VITE_API_URL="$API_URL" npm run build

# Versão NOVA: o mesmo app em /app + o site novo no resto. A config é TEMPLATE (a origem da API entra na CSP ao
# subir o container — variável API_ORIGEM no compose); o default.conf do estágio "servidor" é substituído por ela.
FROM servidor AS servidor-novo
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/spa/nginx-novo.conf.template /etc/nginx/templates/default.conf.template
COPY docker/spa/snippets/csp-site.inc.template /etc/nginx/templates/csp-site.inc.template
COPY docker/spa/snippets/seguranca.conf /etc/nginx/snippets/seguranca.conf
COPY --from=web-build /web/dist /usr/share/nginx/html/web
