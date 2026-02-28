import { z } from 'zod';

export const createOrderSchema = z.object({
  cartId: z.number().int().positive('Cart ID must be a positive integer'),
  shippingMethodId: z.number().int().positive('Shipping method ID must be a positive integer').optional(),
  billingOrderNo: z.string().optional(),
  billingFirstName: z.string().min(1, 'First name is required'),
  billingLastName: z.string().min(1, 'Last name is required'),
  billingEmail: z.string().email('Valid email is required'),
  billingCompanyName: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(), // Search by order number
  status: z.enum(['CREATED', 'BACKORDER', 'READY_FOR_SHIPMENT', 'FULLFILLED', 'CANCELLED', 'PROCESSING']).optional(),
  type: z.enum(['all', 'recent']).default('all'), // all = all orders, recent = last 30 days
  startDate: z.coerce.date().optional(), // Filter orders from this date (inclusive)
  endDate: z.coerce.date().optional(), // Filter orders until this date (inclusive)
}).refine(
  (data) => {
    // If both dates are provided, startDate should be before or equal to endDate
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: "startDate must be before or equal to endDate",
    path: ["startDate"],
  }
);

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// Export query schema (same as listOrders but without pagination)
export const exportOrdersQuerySchema = z.object({
  search: z.string().optional(), // Search by order number
  status: z.enum(['CREATED', 'BACKORDER', 'READY_FOR_SHIPMENT', 'FULLFILLED', 'CANCELLED', 'PROCESSING']).optional(),
  type: z.enum(['all', 'recent']).default('all'), // all = all orders, recent = last 30 days
  startDate: z.coerce.date().optional(), // Filter orders from this date (inclusive)
  endDate: z.coerce.date().optional(), // Filter orders until this date (inclusive)
}).refine(
  (data) => {
    // If both dates are provided, startDate should be before or equal to endDate
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: "startDate must be before or equal to endDate",
    path: ["startDate"],
  }
);

export type ExportOrdersQuery = z.infer<typeof exportOrdersQuerySchema>;

// List backorder products query schema
export const listBackorderProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(), // Search by order number, product code, or product name
});

export type ListBackorderProductsQuery = z.infer<typeof listBackorderProductsQuerySchema>;

// Export backorder products query schema (no pagination, only search)
export const exportBackorderProductsQuerySchema = z.object({
  search: z.string().optional(), // Search by order number, product code, or product name
});

export type ExportBackorderProductsQuery = z.infer<typeof exportBackorderProductsQuerySchema>;

// Reorder schema - add order items to cart (replacing existing cart items)
export const reorderSchema = z.object({
  orderNumber: z.string().min(1, 'Order number is required'),
});

export type ReorderInput = z.infer<typeof reorderSchema>;
