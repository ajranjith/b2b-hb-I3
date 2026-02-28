import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { healthCheck } from '../../lib/prisma';

const healthRoutes = new Hono();

const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string(),
  services: z.object({
    database: z.enum(['connected', 'disconnected']),
  }),
});

healthRoutes.get(
  '/',
  describeRoute({
    tags: ['Health'],
    summary: 'Health check',
    description: 'Check the health status of the API and its dependencies',
    responses: {
      200: {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: resolver(healthResponseSchema),
          },
        },
      },
      503: {
        description: 'Service is unhealthy',
        content: {
          'application/json': {
            schema: resolver(healthResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const dbHealthy = await healthCheck();

    const response = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
    };

    return c.json(response, dbHealthy ? 200 : 503);
  }
);

export default healthRoutes;
