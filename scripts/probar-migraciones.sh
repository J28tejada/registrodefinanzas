#!/usr/bin/env bash
#
# Prueba las migraciones en un Postgres desechable.
#
#   npm run migraciones
#   PG_BIN=/opt/homebrew/opt/postgresql@16/bin npm run migraciones     # en una Mac
#
# Por qué existe: CI no corre nada y las migraciones las pega el dueño a mano
# en el editor SQL de Supabase, sobre la base real. Lo único que se puede
# probar antes es esto: un clúster nuevo en un directorio temporal, sin red
# —escucha solo en un socket adentro de ese directorio— y que se borra al
# terminar. No lee PGHOST ni ninguna otra variable de libpq: no hay forma de
# que termine conectado a otra base.
#
# Qué hace, y corta en el primer paso que falle:
#   1. levanta Postgres 16 (PG_BIN, o /usr/lib/postgresql/16/bin) en un
#      directorio nuevo adentro de PGPRUEBA_DIR (o del temporal del sistema);
#   2. crea una base vacía y le pone lo mínimo de Supabase
#      (scripts/pg/stubs-supabase.sql);
#   3. aplica todas las migraciones en orden, y la última OTRA VEZ: en el
#      editor de Supabase es fácil correrla dos veces, y tiene que aguantarlo;
#   4. corre cada scripts/pg/*.prueba.sql, cada una en su copia de esa base.
#
# PGPRUEBA_CONSERVAR=1 deja el clúster y su log para mirarlos después.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PUERTO="${PGPRUEBA_PUERTO:-54329}"
BASE="${PGPRUEBA_DIR:-${TMPDIR:-/tmp}}"
BASE="${BASE%/}"

# Ninguna variable de libpq puede mandar a psql a otro servidor.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS

for b in initdb pg_ctl psql; do
  if [ ! -x "$PG_BIN/$b" ]; then
    echo "✗ No está $PG_BIN/$b. Decí dónde está Postgres 16 con PG_BIN=…"
    exit 1
  fi
done

mkdir -p "$BASE" || exit 1
DIR="$(mktemp -d "$BASE/pgprueba.XXXXXX")" || { echo "✗ No se pudo crear un directorio en $BASE"; exit 1; }
DATOS="$DIR/datos"
SALIDA="$DIR/salida.txt"

# initdb y postgres se niegan a correr como root: ahí van como el usuario
# postgres del sistema, dueño del directorio nuevo.
if [ "$(id -u)" = 0 ]; then
  chown postgres "$DIR" || exit 1
  como_pg() { su postgres -s "$BASH" -c "$(printf '%q ' "$@")"; }
else
  como_pg() { "$@"; }
fi

apagar() {
  como_pg "$PG_BIN/pg_ctl" -D "$DATOS" -m immediate stop >/dev/null 2>&1
  if [ "${PGPRUEBA_CONSERVAR:-}" = 1 ]; then
    echo "  (el clúster quedó en $DIR)"
  else
    rm -rf "$DIR"
  fi
}
trap apagar EXIT

FALLAS=0

# Corre un paso callado. Si falla, muestra lo que dijo y suma la falla.
paso() {
  local nombre="$1"; shift
  if "$@" >"$SALIDA" 2>&1; then
    echo "✓ $nombre"
    return 0
  fi
  echo "✗ $nombre"
  sed 's/^/    /' "$SALIDA"
  FALLAS=$((FALLAS + 1))
  return 1
}

paso "initdb" como_pg "$PG_BIN/initdb" -D "$DATOS" -A trust -U postgres --no-sync || exit 1

cat >>"$DATOS/postgresql.conf" <<CONF

# probar-migraciones: sin red, solo el socket de este directorio.
listen_addresses = ''
port = $PUERTO
unix_socket_directories = '$DIR'
fsync = off
CONF

if ! paso "Postgres arriba en $DIR" como_pg "$PG_BIN/pg_ctl" -D "$DATOS" -l "$DIR/postgres.log" -w -t 30 start; then
  sed 's/^/    /' "$DIR/postgres.log" 2>/dev/null
  exit 1
fi

PSQL=("$PG_BIN/psql" -X -q -h "$DIR" -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1)

paso "base nueva" "${PSQL[@]}" -d postgres -c 'create database finanzas' || exit 1
paso "stubs de Supabase" "${PSQL[@]}" -d finanzas -f "$RAIZ/scripts/pg/stubs-supabase.sql" || exit 1

shopt -s nullglob
MIGRACIONES=("$RAIZ"/supabase/migrations/*.sql)
if [ "${#MIGRACIONES[@]}" -eq 0 ]; then
  echo "✗ No hay migraciones en supabase/migrations"
  exit 1
fi
for m in "${MIGRACIONES[@]}"; do
  paso "$(basename "$m")" "${PSQL[@]}" -d finanzas -f "$m" || exit 1
done
ULTIMA="${MIGRACIONES[${#MIGRACIONES[@]}-1]}"
paso "$(basename "$ULTIMA"), otra vez" "${PSQL[@]}" -d finanzas -f "$ULTIMA" || exit 1

# Cada prueba arranca de la base recién migrada, sin lo que dejó la anterior.
n=0
for p in "$RAIZ"/scripts/pg/*.prueba.sql; do
  n=$((n + 1))
  copia="prueba_$n"
  if ! paso "copia para $(basename "$p")" "${PSQL[@]}" -d postgres -c "create database $copia template finanzas"; then
    continue
  fi
  if "${PSQL[@]}" -d "$copia" -f "$p" >"$SALIDA" 2>&1; then
    echo "✓ $(basename "$p")"
  else
    echo "✗ $(basename "$p")"
    FALLAS=$((FALLAS + 1))
  fi
  # Lo que imprimió la prueba: un ✓ por caso, y el error del que haya fallado.
  sed 's/^/    /' "$SALIDA"
done

if [ "$FALLAS" -eq 0 ]; then
  echo "✓ todo en orden"
else
  echo "✗ $FALLAS falla(s)"
  exit 1
fi
