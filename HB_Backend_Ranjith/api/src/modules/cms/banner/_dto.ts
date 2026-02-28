import { z } from 'zod';

export const createBannerSchema = z.object({
  type: z.enum(['Horizontal', 'Vertical']).default('Horizontal'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  imgae: z.string().min(1, 'Image URL is required'),
  link: z.string().optional(),
  orderNo: z.number().int().min(0).optional(),
});

export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = z.object({
  type: z.enum(['Horizontal', 'Vertical']).optional(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  imgae: z.string().min(1, 'Image URL is required').optional(),
  link: z.string().optional(),
  orderNo: z.number().int().min(0).optional(),
  status: z.boolean().optional(),
});

export const listBannersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['Horizontal', 'Vertical']).optional(),
});

export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
export type ListBannersQuery = z.infer<typeof listBannersQuerySchema>;
