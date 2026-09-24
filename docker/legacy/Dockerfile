# Oráculo: o Laravel-Vue.js (Laravel 5.3.18) rodando como em 2017.
# Somente leitura: o código é COPIADO para a imagem; legacy/ nunca é alterado.
FROM php:7.1-apache

# Debian stretch foi para o archive
RUN sed -i 's|deb.debian.org|archive.debian.org|g; s|security.debian.org|archive.debian.org|g; /stretch-updates/d' /etc/apt/sources.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends git unzip libicu-dev libzip-dev zlib1g-dev default-mysql-client \
 && docker-php-ext-install pdo_mysql intl zip \
 && a2enmod rewrite \
 && rm -rf /var/lib/apt/lists/*

# Composer 2.2 LTS ainda suporta PHP 7.1
COPY --from=composer:2.2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf

WORKDIR /var/www/html
COPY legacy/composer.json legacy/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY legacy/ ./
RUN composer dump-autoload --optimize --no-dev \
 && chown -R www-data:www-data storage bootstrap/cache

COPY docker/legacy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
