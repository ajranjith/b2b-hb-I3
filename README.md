# Hotbray Backend

Backend services for the Hotbray B2B platform. The primary API lives under `HB_Backend_Ranjith/api`.

## Structure

- `HB_Backend_Ranjith/api` - Bun-based API service
- `HB_Backend_Ranjith/search-engine` - Typesense search integration

## Local setup (API)

```bash
cd HB_Backend_Ranjith/api
bun install
bun run dev
```

## Docker

```bash
docker build -t hotbray-backend:latest .
```
