#!/bin/sh
set -e
echo "Pushing schema..."
npx drizzle-kit push --force
echo "Seeding..."
npx tsx server/seed.ts
echo "Starting API..."
exec npx tsx server/index.ts
