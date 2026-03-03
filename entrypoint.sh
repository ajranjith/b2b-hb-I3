#!/bin/sh
set -e

echo "Starting entrypoint..."

echo "PORT=${PORT:-8181}"
if [ -n "$NODE_ENV" ]; then
  echo "NODE_ENV=$NODE_ENV"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

echo "DATABASE_URL=***set***"

if [ -z "$TYPESENSE_API_KEY" ]; then
  echo "WARN: TYPESENSE_API_KEY not set. Search disabled."
else
  echo "TYPESENSE_API_KEY=***set***"
fi

if [ -z "$TYPESENSE_HOST" ]; then
  echo "WARN: TYPESENSE_HOST not set. Search disabled."
else
  echo "TYPESENSE_HOST=$TYPESENSE_HOST"
fi

if [ -z "$TYPESENSE_PORT" ]; then
  echo "WARN: TYPESENSE_PORT not set. Using default 8108."
else
  echo "TYPESENSE_PORT=$TYPESENSE_PORT"
fi

if [ -z "$TYPESENSE_PROTOCOL" ]; then
  echo "WARN: TYPESENSE_PROTOCOL not set. Using default http."
else
  echo "TYPESENSE_PROTOCOL=$TYPESENSE_PROTOCOL"
fi

echo "Running migrations..."
if bunx prisma migrate deploy; then
  echo "Migrations complete."
else
  echo "Migration failed: exit $?" >&2
  exit 1
fi

echo "Starting server..."
exec "$@"
