import { z } from 'zod';
import { NewsOffersType } from 'generated/prisma';

export const createNewsOfferSchema = z.object({
  type: z.nativeEnum(NewsOffersType, {
    errorMap: () => ({ message: 'Type must be either News or Offers' }),
  }),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  longDescription: z.string().optional(),
  thumbnail: z.string().min(1, 'Thumbnail URL is required'),
  fileUpload: z.string().optional(),
  subtext: z.string().optional(),
  fromDate: z.coerce.date({
    required_error: 'From date is required',
  }),
  toDate: z.coerce.date().optional().nullable(),
});

export type CreateNewsOfferInput = z.infer<typeof createNewsOfferSchema>;

export const updateNewsOfferSchema = z.object({
  type: z.nativeEnum(NewsOffersType).optional(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  longDescription: z.string().optional(),
  thumbnail: z.string().min(1, 'Thumbnail URL is required').optional(),
  fileUpload: z.string().optional(),
  subtext: z.string().optional(),
  orderNo: z.number().int().min(0).optional(),
  status: z.boolean().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional().nullable(),
});

export const listNewsOffersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.nativeEnum(NewsOffersType).optional(),
  filterType: z.enum(['admin', 'dealer']).optional(),
});

export type UpdateNewsOfferInput = z.infer<typeof updateNewsOfferSchema>;
export type ListNewsOffersQuery = z.infer<typeof listNewsOffersQuerySchema>;
