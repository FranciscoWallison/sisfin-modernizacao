#!/bin/sh
set -e
cd /var/www/html

# .env montado a partir das variáveis do compose (nunca versionado com segredos reais)
env | grep -E '^(APP_|DB_|JWT_|IUGU_|PUSHER_|MAIL_|BROADCAST_|CACHE_|SESSION_|QUEUE_|URL_|BANK_|API_URL)' > .env

echo "Aguardando MySQL em $DB_HOST..."
until mysqladmin ping -h"$DB_HOST" -u"$DB_USERNAME" -p"$DB_PASSWORD" --silent; do sleep 2; done

if [ "${LEGACY_SEED:-0}" = "1" ] && [ "$(mysql -N -h"$DB_HOST" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -e "SHOW TABLES LIKE 'migrations'")" = "" ]; then
  php artisan migrate --force --seed
fi

exec "$@"
