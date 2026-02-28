import path from 'path';
import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrate: {
    async onMigrate() {
      console.log('Running migrations...');
    },
  },
});
