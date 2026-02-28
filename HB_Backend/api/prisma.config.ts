import path from 'path';
import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config();

const DB_URL = process.env.DATABASE_URL || '';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrate: {
    async onMigrate() {
      console.log('Running migrations...');
    },
  },
});
