#!/bin/sh
set -e

# Crea/actualiza las tablas en la base de datos del volumen persistente.
npx prisma db push --skip-generate --accept-data-loss

# Arranca Next escuchando en el puerto que asigna Railway.
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
