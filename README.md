# Hotbray Backend

Backend services for the Hotbray B2B platform. The primary API lives under `HB_Backend/api`.

## Structure

- `HB_Backend/api` - Bun-based API service
- `HB_Backend/search-engine` - Typesense search integration

## Local setup (API)

```bash
cd HB_Backend/api
bun install
bun run dev
```

## Docker

```bash
docker build -t hotbray-backend:latest .
```

## CI/CD (Azure App Service + ACR)

The GitHub Actions workflow builds the container image and pushes it to Azure Container Registry (ACR), then updates the App Service to use the new image. Authentication uses Azure federated identity (OIDC). No secrets are stored in the repo.

### Required GitHub Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_ACR_NAME`
- `AZURE_ACR_LOGIN_SERVER`
- `AZURE_RESOURCE_GROUP`
- `AZURE_WEBAPP_NAME`

### App Service configuration

Set these in Azure App Service ? Configuration ? Application settings:

- `DATABASE_URL` (format: `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require`)
- `WEBSITES_PORT=80`

The backend fails fast if `DATABASE_URL` is missing.
