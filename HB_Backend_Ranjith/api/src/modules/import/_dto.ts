import { z } from 'zod';

export const importErrorSchema = z.object({
  row: z.number(),
  data: z.any(),
  errors: z.array(z.string()),
});

export const importResultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    importLogId: z.number(),
    totalRows: z.number(),
    successCount: z.number(),
    errorCount: z.number(),
    durationMs: z.number(),
    errors: z.array(importErrorSchema),
  }),
});

export const listImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  type: z.enum(['PARTS', 'DEALERS', 'SUPERSEDED', 'BACKORDER', 'ORDER_STATUS']).optional(),
});

export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;

export const getTemplateSchema = z.object({
  type: z.enum(['dealer', 'product', 'superseded', 'overallStatus', 'Backlog'], {
    errorMap: () => ({ message: 'Type must be one of: dealer, product, superseded, overallStatus, Backlog' }),
  }),
});

export type GetTemplateInput = z.infer<typeof getTemplateSchema>;

export const getImportErrorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetImportErrorsQuery = z.infer<typeof getImportErrorsQuerySchema>;
