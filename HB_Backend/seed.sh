#!/bin/bash
# Database Seeding Script for Docker

echo "🌱 Seeding database..."

docker-compose exec api bun run db:seed

echo "✅ Database seeding complete!"
echo ""
echo "Default admin user created:"
echo "  Email: ajith@dgstechlimited.com"
echo "  Password: Check your seed.ts file"
