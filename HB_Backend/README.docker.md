# Docker Deployment Guide - HB Backend

This repository contains Docker configuration for deploying the Hotbray Backend services.

## Architecture

The backend consists of three main services:

1. **PostgreSQL Database** (Port 5432)
   - Relational database for application data
   - Uses Prisma ORM for migrations and queries
   - Persistent volume for data storage

2. **Typesense Search Engine** (Port 8108)
   - Fast, typo-tolerant search engine
   - Used for product search and filtering
   - Persistent volume for search index data

3. **Backend API** (Port 3000)
   - Bun + Hono framework
   - RESTful API with OpenAPI documentation
   - Connects to PostgreSQL and Typesense

## Quick Start

### 1. Development/Local Deployment

```bash
# Navigate to backend directory
cd /Users/ajith/Desktop/Projects/hb_backend

# Build and run all services
docker-compose up -d

# Seed the database (run once after first start)
./seed.sh
# Or manually:
# docker-compose exec api bun run db:seed

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f typesense

# Stop services
docker-compose down
```

Access the services:
- API: http://localhost:3000
- API Documentation: http://localhost:3000/docs
- Typesense: http://localhost:8108
- PostgreSQL: localhost:5432

### 2. Production Deployment

#### Step 1: Configure Environment Variables

Copy the environment template and update with production values:

```bash
cp .env.docker .env.docker.local
```

Edit `.env.docker.local`:

```env
# Production Configuration
NODE_ENV=production
DOMAIN=api.yourdomain.com

# PostgreSQL - Use strong passwords!
POSTGRES_USER=hb_production_user
POSTGRES_PASSWORD=your_secure_database_password
POSTGRES_DB=hb_production

# Typesense - Generate a secure API key
TYPESENSE_API_KEY=your_secure_typesense_api_key
```

#### Step 2: Build and Deploy

```bash
# Build with production environment
docker-compose --env-file .env.docker.local up -d --build

# Check service health
docker-compose ps

# View logs
docker-compose logs -f
```

## Database Management

### Initial Setup & Migrations

```bash
# Run migrations (creates/updates database schema)
# Note: Migrations run automatically on container startup
docker-compose exec api bunx prisma migrate deploy

# Generate Prisma client (if needed)
docker-compose exec api bunx prisma generate

# Seed database with initial data
./seed.sh
# Or:
docker-compose exec api bun run db:seed

# What gets seeded:
# - User roles (Admin, Dealer)
# - Shipping methods (Sea, Air, DHL, FedEx, Others)
# - Default admin user (ajith@dgstechlimited.com)
```

### Database Operations

```bash
# Open Prisma Studio (Database GUI)
docker-compose exec api bunx prisma studio

# Create new migration (development)
docker-compose exec api bunx prisma migrate dev --name migration_name

# Reset database (WARNING: destroys all data)
docker-compose exec api bunx prisma migrate reset

# View database logs
docker-compose logs postgres

# Connect to PostgreSQL directly
docker-compose exec postgres psql -U hb_user -d hb_backend
```

### Backup & Restore

```bash
# Backup database
docker-compose exec postgres pg_dump -U hb_user hb_backend > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U hb_user -d hb_backend

# Backup with docker volume
docker run --rm -v hb_backend_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
```

## Service Management

### Individual Service Control

```bash
# Restart specific service
docker-compose restart api
docker-compose restart postgres
docker-compose restart typesense

# Stop specific service
docker-compose stop api

# Start specific service
docker-compose start api

# Rebuild specific service
docker-compose up -d --build api

# View service status
docker-compose ps

# Execute commands in running container
docker-compose exec api sh
docker-compose exec postgres psql -U hb_user -d hb_backend
```

### Health Checks

```bash
# Check all service health
docker-compose ps

# API health check
curl http://localhost:3000/health

# Typesense health check
curl http://localhost:8108/health

# PostgreSQL health check
docker-compose exec postgres pg_isready -U hb_user
```

### Logs & Debugging

```bash
# View all logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f api

# View last 100 lines
docker-compose logs --tail=100 api

# Follow logs with timestamps
docker-compose logs -f -t api

# Debug API container
docker-compose exec api sh
docker-compose exec api bun run src/index.ts
```

## Development Workflow

### Local Development with Docker

```bash
# Start services
docker-compose up -d

# Watch API logs
docker-compose logs -f api

# Make code changes in ./api/src
# API will auto-reload with hot reload (if configured)

# Rebuild after dependency changes
docker-compose up -d --build api
```

### Running Commands in Container

```bash
# Install new dependencies
docker-compose exec api bun add package-name

# Run TypeScript checks
docker-compose exec api bunx tsc --noEmit

# Execute custom scripts
docker-compose exec api bun run script-name
```

## Production Best Practices

### 1. Environment Variables

Never commit `.env.docker.local` to version control. Use secure, randomly generated passwords:

```bash
# Generate secure password
openssl rand -base64 32

# Generate Typesense API key
openssl rand -hex 32
```

### 2. Database Security

```yaml
# In production, don't expose PostgreSQL port
# Remove or comment out in docker-compose.yml:
ports:
  - "5432:5432"  # Remove this line
```

### 3. Resource Limits

Add resource limits to prevent services from consuming excessive resources:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 4. Backup Strategy

Set up automated backups:

```bash
# Add to crontab for daily backups at 2 AM
0 2 * * * cd /path/to/hb_backend && docker-compose exec postgres pg_dump -U hb_user hb_backend > backups/backup-$(date +\%Y\%m\%d).sql
```

### 5. Reverse Proxy Setup

Use Nginx or Traefik as reverse proxy:

```nginx
# Nginx configuration
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 6. SSL/TLS Configuration

Use Let's Encrypt with Certbot:

```bash
# Install Certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d api.yourdomain.com
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy Backend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build API Image
        run: |
          cd api
          docker build -t hb-api:${{ github.sha }} .

      - name: Deploy with Docker Compose
        run: |
          docker-compose --env-file .env.docker.local up -d --build

      - name: Run Migrations
        run: |
          docker-compose exec -T api bunx prisma migrate deploy
```

### GitLab CI Example

```yaml
stages:
  - build
  - deploy

build:
  stage: build
  script:
    - cd api
    - docker build -t hb-api:$CI_COMMIT_SHA .

deploy:
  stage: deploy
  script:
    - docker-compose --env-file .env.docker.local up -d --build
    - docker-compose exec -T api bunx prisma migrate deploy
```

## Monitoring

### Container Stats

```bash
# View resource usage
docker stats hb-api hb-postgres hb-typesense

# View detailed container info
docker inspect hb-api
```

### Log Aggregation

Set up centralized logging:

```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Troubleshooting

### API Not Starting

```bash
# Check logs
docker-compose logs api

# Common issues:
# 1. Database not ready - wait for postgres health check
# 2. Prisma client not generated - run: docker-compose exec api bunx prisma generate
# 3. Migrations not applied - run: docker-compose exec api bunx prisma migrate deploy
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check database connectivity
docker-compose exec postgres pg_isready -U hb_user

# Test connection from API container
docker-compose exec api psql postgresql://hb_user:hb_password@postgres:5432/hb_backend
```

### Typesense Issues

```bash
# Check Typesense health
curl http://localhost:8108/health

# View Typesense logs
docker-compose logs typesense

# Reset Typesense data (WARNING: deletes all search data)
docker-compose down
rm -rf search-engine/typesense-data/*
docker-compose up -d typesense
```

### Port Conflicts

```bash
# Check what's using a port
lsof -i :3000
lsof -i :5432
lsof -i :8108

# Kill process using port
kill -9 <PID>
```

### Clean Restart

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes all data)
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d --build
```

## File Structure

```
hb_backend/
├── docker-compose.yml         # Main orchestration file (ALL services)
├── .env.docker               # Environment template
├── .env.docker.local         # Local/production config (gitignored)
├── README.docker.md          # This file
├── api/
│   ├── Dockerfile            # API container definition
│   ├── .dockerignore         # Files to exclude from build
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   ├── migrations/       # Database migrations
│   │   └── seed.ts           # Seed data
│   └── src/                  # API source code
└── search-engine/
    ├── typesense-data/       # Persistent search data (volume mount)
    └── README.md             # Typesense data directory info
```

## Performance Tuning

### PostgreSQL Optimization

```bash
# Edit PostgreSQL config
docker-compose exec postgres vi /var/lib/postgresql/data/postgresql.conf

# Recommended settings for production:
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 5MB
max_connections = 100
```

### API Optimization

```dockerfile
# In Dockerfile, optimize build caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
```

## Support

For issues or questions:
1. Check container logs: `docker-compose logs -f`
2. Verify environment variables are set correctly
3. Ensure ports 3000, 5432, 8108 are not in use
4. Check service health: `docker-compose ps`
5. Review Docker daemon status: `docker info`

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Typesense Documentation](https://typesense.org/docs/)
