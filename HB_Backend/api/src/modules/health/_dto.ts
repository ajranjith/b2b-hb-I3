import { z } from 'zod';

// Example DTO schemas for validation
// Use these patterns when creating your own modules

export const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  services: z.object({
    database: z.enum(['connected', 'disconnected']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
