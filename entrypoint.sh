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
  echo "TYPESENSE_API_KEY is not set (search disabled)"
else
  echo "TYPESENSE_API_KEY=***set***"
fi

if [ -n "$TYPESENSE_HOST" ]; then
  echo "TYPESENSE_HOST=$TYPESENSE_HOST"
fi
if [ -n "$TYPESENSE_PORT" ]; then
  echo "TYPESENSE_PORT=$TYPESENSE_PORT"
fi
if [ -n "$TYPESENSE_PROTOCOL" ]; then
  echo "TYPESENSE_PROTOCOL=$TYPESENSE_PROTOCOL"
fi

echo "Running migrations..."
if bunx prisma migrate deploy; then
  echo "Migrations complete."
else
  echo "Migration failed: exit $?" >&2
fi

echo "Starting server..."
exec "$@"
