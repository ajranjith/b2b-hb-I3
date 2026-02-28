import type { Hono } from 'hono';
import { openAPISpecs } from 'hono-openapi';
import { apiReference } from '@scalar/hono-api-reference';

interface DocsConfig {
  title: string;
  description: string;
  version?: string;
  servers?: Array<{ url: string; description: string }>;
}

export function setupDocs(app: Hono, config: DocsConfig) {
  const { title, description, version = '1.0.0', servers = [] } = config;

  // OpenAPI spec endpoint
  app.get(
    '/openapi',
    openAPISpecs(app, {
      documentation: {
        info: {
          title,
          description,
          version,
        },
        servers:
          servers.length > 0
            ? servers
            : [{ url: 'http://localhost:3000', description: 'Local' }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    })
  );

  // Scalar API reference UI
  app.get(
    '/docs',
    apiReference({
      theme: 'kepler',
      spec: { url: '/openapi' },
      defaultHttpClient: {
        targetKey: 'shell',
        clientKey: 'curl',
      },
      layout: 'modern',
      darkMode: true,
      showSidebar: true,
      hiddenClients: [],
    })
  );
}
