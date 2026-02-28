import { healthCheck as dbHealthCheck } from '../../lib/prisma';
import type { HealthResponse } from './_dto';

// Example service layer
// Services contain business logic and are called by route handlers

export async function getHealthStatus(): Promise<HealthResponse> {
  const dbHealthy = await dbHealthCheck();

  return {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
    },
  };
}
