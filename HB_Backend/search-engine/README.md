# Typesense Search Engine Data

This directory contains persistent data for the Typesense search engine.

## Important Note

**The docker-compose.yml file has been moved to the root directory.**

To manage all backend services (PostgreSQL, Typesense, and API), use:

```bash
# From the hb_backend root directory
docker-compose up -d
```

## Data Directory

- `typesense-data/`: Persistent storage for Typesense search indices and data
- This directory is mounted as a volume in the Docker container
- Data persists across container restarts

## Manual Typesense Management

If you need to run Typesense standalone (not recommended for production):

```bash
docker run -p 8108:8108 \
  -v $(pwd)/typesense-data:/data \
  typesense/typesense:29.0 \
  --data-dir /data \
  --api-key=Hh873bbdS8044w1291 \
  --enable-cors
```

## Documentation

For complete Docker setup documentation, see:
- `/Users/ajith/Desktop/Projects/hb_backend/README.docker.md`
