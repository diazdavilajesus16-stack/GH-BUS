#!/bin/sh
# Se ejecuta solo la primera vez que se crea el volumen de MySQL.
# El usuario de la aplicación ya tiene todos los permisos sobre MYSQL_DATABASE.
# Aquí además se le permite crear/borrar las bases temporales "test_*" que usa
# Django al ejecutar las pruebas. No recibe ningún otro privilegio global.
set -e
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<EOSQL
GRANT ALL PRIVILEGES ON \`test\\_%\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL
