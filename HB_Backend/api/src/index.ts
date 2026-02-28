import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from 'dotenv';

import routes from './modules/route';
import { setupDocs } from './utils/docs';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { scheduledImportsService } from './services/scheduledImports';

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const app = new Hono();
const port = parseInt(process.env.PORT || '3000', 10);

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://unpensioned-hortencia-unchartered.ngrok-free.dev",
      "https://melaine-tideful-quincy.ngrok-free.dev",
      "https://jason-candy-owners-tech.trycloudflare.com",
      "https://defined-status-action-take.trycloudflare.com","https://boston-sound-stress-raises.trycloudflare.com"
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  })
);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'HB Backend API',
    version: '1.0.0',
    docs: '/docs',
    health: '/api/v1/health',
  });
});

// API routes
app.route('/api/v1', routes);

// Setup API documentation
setupDocs(app, {
  title: 'HB Backend API',
  description: 'API documentation for HB Backend service',
  version: '1.0.0',
  servers: [
    { url: 'http://localhost:3000', description: 'Local Development' },
  ],
});

// Error handlers
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Export for Bun
export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
};

console.log(`Server running on http://localhost:${port}`);
console.log(`API Docs available at http://localhost:${port}/docs`);

// Start SharePoint import scheduler
try {
  scheduledImportsService.start();
} catch (error) {
  console.error('Failed to start SharePoint import scheduler:', error);
}

// Graceful shutdown handlers
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  scheduledImportsService.stop();

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));


