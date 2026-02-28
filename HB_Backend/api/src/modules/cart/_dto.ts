import { z } from 'zod';

export const addToCartSchema = z.object({
  productCode: z.string().min(1, 'Product code is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

export const updateCartItemSchema = z.object({
  productCode: z.string().min(1, 'Product code is required'),
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
});

export const removeCartItemSchema = z.object({
  productCode: z.string().min(1, 'Product code is required'),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;
