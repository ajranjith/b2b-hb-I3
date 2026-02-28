import { z } from 'zod';

export const createExternalLinkSchema = z.object({
  image: z.string().min(1, 'Image URL is required'),
  title: z.string().min(1, 'Title is required'),
  link: z.string().min(1, 'Link is required'),
});

export type CreateExternalLinkInput = z.infer<typeof createExternalLinkSchema>;

export const updateExternalLinkSchema = z.object({
  image: z.string().min(1, 'Image URL is required').optional(),
  title: z.string().min(1, 'Title is required').optional(),
  link: z.string().min(1, 'Link is required').optional(),
  orderNo: z.number().int().min(0).optional(),
  status: z.boolean().optional(),
});

export const listExternalLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateExternalLinkInput = z.infer<typeof updateExternalLinkSchema>;
export type ListExternalLinksQuery = z.infer<typeof listExternalLinksQuerySchema>;
