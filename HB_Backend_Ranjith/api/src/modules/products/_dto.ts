import { z } from "zod";
import { ProductType } from "../../../generated/prisma";

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(40000).default(20),
  q: z.string().optional().default("*"),
  type: z.enum(["GENUINE", "AFTERMARKET", "BRANDED"]).optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productIdParamSchema = z.object({
  id: z.coerce.number().int().positive("Product ID must be a positive integer"),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, "Product name is required").optional(),
  type: z.nativeEnum(ProductType).optional(),
  supplierCode: z.string().optional().nullable(),
  height: z.number().min(0).optional().nullable(),
  length: z.number().min(0).optional().nullable(),
  width: z.number().min(0).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  stock: z.number().int().min(0, "Stock must be non-negative").optional(),
  net1: z.number().min(0).optional(),
  net2: z.number().min(0).optional(),
  net3: z.number().min(0).optional(),
  net4: z.number().min(0).optional(),
  net5: z.number().min(0).optional(),
  net6: z.number().min(0).optional(),
  net7: z.number().min(0).optional(),
  image: z.string().url("Image must be a valid URL").optional().nullable(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.nativeEnum(ProductType).optional(),
});

export type ListProductsAdminQuery = z.infer<
  typeof listProductsAdminQuerySchema
>;

export const createProductSchema = z.object({
  code: z.string().min(1, "Product code is required"),
  name: z.string().min(1, "Product name is required"),
  type: z.nativeEnum(ProductType),
  supplierCode: z.string().optional().nullable(),
  height: z.number().min(0).optional().nullable(),
  length: z.number().min(0).optional().nullable(),
  width: z.number().min(0).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  stock: z.number().int().min(0, "Stock must be non-negative").optional().default(0),
  net1: z.number().min(0).optional().default(0),
  net2: z.number().min(0).optional().default(0),
  net3: z.number().min(0).optional().default(0),
  net4: z.number().min(0).optional().default(0),
  net5: z.number().min(0).optional().default(0),
  net6: z.number().min(0).optional().default(0),
  net7: z.number().min(0).optional().default(0),
  image: z.string().url("Image must be a valid URL").optional().nullable(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const productCountQuerySchema = z.object({
  q: z.string().optional().default("*"),
});

export type ProductCountQuery = z.infer<typeof productCountQuerySchema>;
