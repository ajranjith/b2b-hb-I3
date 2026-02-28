# Docker Deployment Guide (Backend)

This repository contains Docker configuration for deploying the Hotbray backend API.

## Quick Start

### Build image

```bash
docker build -t hotbray-backend:latest .
```

### Run container

```bash
docker run -d --name hotbray-backend -p 8080:80 --restart unless-stopped hotbray-backend:latest
```

Access the API:

- http://localhost:8080

## Health check

```bash
curl -I http://localhost:8080/health
```

## File structure

```
.
|-- Dockerfile
|-- .dockerignore
|-- .env.docker
|-- README.docker.md
|-- HB_Backend/
```

