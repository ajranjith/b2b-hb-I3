import { z } from 'zod';

export const createMarqueeSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  status: z.boolean().optional().default(true),
});

export type CreateMarqueeInput = z.infer<typeof createMarqueeSchema>;

export const updateMarqueeSchema = z.object({
  text: z.string().min(1, 'Text is required').optional(),
  status: z.boolean().optional(),
});

export type UpdateMarqueeInput = z.infer<typeof updateMarqueeSchema>;

export const listMarqueesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.coerce.boolean().optional(),
});

export type ListMarqueesQuery = z.infer<typeof listMarqueesQuerySchema>;
