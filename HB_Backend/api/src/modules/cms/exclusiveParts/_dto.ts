import { z } from 'zod';

export const createExclusivePartSchema = z.object({
  title: z.string().optional().default('Exclusive Parts'),
  description: z.string().optional().default('Download our exclusive parts catalog'),
  imgae: z.string().min(1, 'Image URL is required'),
});

export type CreateExclusivePartInput = z.infer<typeof createExclusivePartSchema>;

export const updateExclusivePartSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  imgae: z.string().min(1, 'Image URL is required').optional(),
  status: z.boolean().optional(),
});

export const listExclusivePartsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateExclusivePartInput = z.infer<typeof updateExclusivePartSchema>;
export type ListExclusivePartsQuery = z.infer<typeof listExclusivePartsQuerySchema>;
