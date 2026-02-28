import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validationHook } from '@/middleware/validationHook';
import { listProductsQuerySchema, productIdParamSchema, updateProductSchema, listProductsAdminQuerySchema, createProductSchema, productCountQuerySchema } from './_dto';
import { listProducts, getProductCounts } from './_services';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import { successResponse } from '@/utils/response';
import { Role } from 'generated/prisma';
import { typesenseClient } from '@/lib/typesense';

const productsRoutes = new Hono();

/**
 * Update a single product in TypeSense
 */
async function updateProductInTypesense(productCode: string): Promise<void> {
  try {
    // Get current collection name from alias
    const aliasInfo = await typesenseClient.aliases('products').retrieve();
    const collectionName = aliasInfo.collection_name;

    // Fetch product with all related data
    const product = await prisma.product.findUnique({
      where: { code: productCode },
      include: {
        prices: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stocks: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!product) {
      console.warn(`[TypeSense Update] Product not found: ${productCode}`);
      return;
    }

    // Fetch product image
    const productImage = await prisma.productImages.findFirst({
      where: {
        productCode: product.code,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch superseded info
    const supersededMapping = await prisma.productSupersededMapping.findFirst({
      where: {
        productCode: product.code,
        status: true,
      },
    });

    const price = product.prices[0];
    const stock = product.stocks[0];

    // Prepare document
    const document = {
      id: String(product.code),
      code: String(product.code),
      name: product.name,
      type: product.type,
      supplierCode: product.supplierCode || '',
      stock: stock?.stock ?? 0,
      currency: price?.currency || 'GBP',
      net1: price?.net1 ? Number(price.net1) : 0,
      net2: price?.net2 ? Number(price.net2) : 0,
      net3: price?.net3 ? Number(price.net3) : 0,
      net4: price?.net4 ? Number(price.net4) : 0,
      net5: price?.net5 ? Number(price.net5) : 0,
      net6: price?.net6 ? Number(price.net6) : 0,
      net7: price?.net7 ? Number(price.net7) : 0,
      height: product.height ? Number(product.height) : undefined,
      length: product.length ? Number(product.length) : undefined,
      width: product.width ? Number(product.width) : undefined,
      weight: product.weight ? Number(product.weight) : undefined,
      createdAt: Math.floor(product.createdAt.getTime() / 1000),
      updatedAt: Math.floor(product.updatedAt.getTime() / 1000),
      image: productImage?.image || '',
      supersededBy: supersededMapping?.supersededBy || '',
    };

    // Update or create document in TypeSense
    await typesenseClient
      .collections(collectionName)
      .documents()
      .upsert(document);

    console.log(`[TypeSense Update] Updated product: ${productCode}`);
  } catch (error) {
    console.error(`[TypeSense Update] Failed to update product ${productCode}:`, error);
    // Don't throw - product DB update should succeed even if TypeSense fails
  }
}

// List Products for Admin (Prisma-based)
productsRoutes.get(
  '/admin',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['Products'],
    summary: 'List products for admin (Prisma)',
    description: 'Get paginated list of products using Prisma queries (Admin only)',
    responses: {
      200: {
        description: 'Paginated list of products',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    code: z.string(),
                    name: z.string(),
                    type: z.string(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    status: z.boolean(),
                    image: z.string().nullable(),
                    price: z.object({
                      net1: z.number(),
                      net2: z.number(),
                      net3: z.number(),
                      net4: z.number(),
                      net5: z.number(),
                      net6: z.number(),
                      net7: z.number(),
                      currency: z.string(),
                    }).nullable(),
                    stock: z.object({
                      stock: z.number(),
                    }).nullable(),
                  })
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              })
            ),
          },
        },
      },
    },
  }),
  zValidator('query', listProductsAdminQuerySchema, validationHook),
  async (c) => {
    const { page, limit, search, type } = c.req.valid('query');
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      status: true,
    };

    // Type filter
    if (type) {
      where.type = type;
    }

    // Search filter (code or name)
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.product.count({ where });

    // Get products with relations
    const products = await prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        prices: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stocks: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Get product codes to fetch images
    const productCodes = products.map(p => p.code);

    // Fetch all images for these products
    const productImages = await prisma.productImages.findMany({
      where: {
        productCode: { in: productCodes },
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Create a map of productCode -> image URL (taking the latest image per product)
    const imageMap = new Map<string, string>();
    for (const img of productImages) {
      if (!imageMap.has(img.productCode)) {
        imageMap.set(img.productCode, img.image);
      }
    }

    // Format response
    const formattedProducts = products.map((product) => {
      const price = product.prices[0] || null;
      const stock = product.stocks[0] || null;

      return {
        id: product.id,
        code: product.code,
        name: product.name,
        type: product.type,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        status: product.status,
        image: imageMap.get(product.code) || null,
        price: price ? {
          net1: Number(price.net1),
          net2: Number(price.net2),
          net3: Number(price.net3),
          net4: Number(price.net4),
          net5: Number(price.net5),
          net6: Number(price.net6),
          net7: Number(price.net7),
          currency: price.currency,
        } : null,
        stock: stock ? {
          stock: stock.stock,
        } : null,
      };
    });

    return c.json({
      success: true,
      data: formattedProducts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

// Create Product (Admin only)
productsRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['Products'],
    summary: 'Create a new product',
    description: 'Create a new product with prices, stock, and optional image (Admin only). Automatically adds to TypeSense search index in real-time.',
    responses: {
      201: {
        description: 'Product created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  code: z.string(),
                  name: z.string(),
                  type: z.string(),
                  createdAt: z.string(),
                  image: z.string().nullable(),
                }),
              })
            ),
          },
        },
      },
      400: {
        description: 'Validation error or product code already exists',
      },
    },
  }),
  zValidator('json', createProductSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');
    const { code, name, type, supplierCode, height, length, width, weight, stock, net1, net2, net3, net4, net5, net6, net7, image } = input;

    // Check if product code already exists
    const existingProduct = await prisma.product.findUnique({
      where: { code },
    });

    if (existingProduct) {
      return c.json(
        {
          success: false,
          message: 'Product code already exists',
        },
        400
      );
    }

    // Create product with prices, stock, and image in a transaction
    const newProduct = await prisma.$transaction(async (tx) => {
      // Create product
      const product = await tx.product.create({
        data: {
          code,
          name,
          type,
          supplierCode,
          height,
          length,
          width,
          weight,
        },
      });

      // Create price record
      await tx.productPrice.create({
        data: {
          productId: product.id,
          net1: net1 || 0,
          net2: net2 || 0,
          net3: net3 || 0,
          net4: net4 || 0,
          net5: net5 || 0,
          net6: net6 || 0,
          net7: net7 || 0,
        },
      });

      // Create stock record
      await tx.productStock.create({
        data: {
          productId: product.id,
          stock: stock || 0,
        },
      });

      // Create image if provided
      if (image) {
        await tx.productImages.create({
          data: {
            productCode: product.code,
            image,
          },
        });
      }

      return product;
    });

    // Add product to TypeSense (async, don't await)
    updateProductInTypesense(newProduct.code).catch((error) => {
      console.error('[Product Create] Failed to add to TypeSense:', error);
    });

    return c.json(
      successResponse({
        id: newProduct.id,
        code: newProduct.code,
        name: newProduct.name,
        type: newProduct.type,
        createdAt: newProduct.createdAt,
        image: image || null,
      }),
      201
    );
  }
);

// List Products with Search and Pagination
productsRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['Products'],
    summary: 'List products with search and pagination',
    description: `Search products using TypeSense full-text search. Returns paginated list of products with superseding products embedded.

**Features:**
- Full-text search across product code and name
- Filter by product type (GENUINE, AFTERMARKET, BRANDED)
- Pagination with accurate counts
- Superseding products embedded in response (for superseded parts)

**Pagination:**
- Based on main products only (not counting superseding products)
- Returns exactly \`limit\` products per page
- Total count reflects main products only

**Superseding Products:**
- If a product has \`supersededBy\`, the \`superseding\` field contains the replacement product details
- Products without superseding have \`superseding: null\`

**Examples:**

Search by product code:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/products?q=LR175&limit=20"
\`\`\`

Filter by type:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/products?type=GENUINE&page=1&limit=20"
\`\`\`

Search all products:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/products?page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of products with embedded superseding products',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.string(),
                    code: z.string(),
                    name: z.string(),
                    type: z.string(),
                    stock: z.number(),
                    currency: z.string(),
                    net1: z.number(),
                    net2: z.number(),
                    net3: z.number(),
                    net4: z.number(),
                    net5: z.number(),
                    net6: z.number(),
                    net7: z.number(),
                    height: z.number().optional(),
                    length: z.number().optional(),
                    width: z.number().optional(),
                    weight: z.number().optional(),
                    createdAt: z.number(),
                    updatedAt: z.number(),
                    image: z.string().optional(),
                    supersededBy: z.string().optional(),
                    superseding: z
                      .object({
                        id: z.string(),
                        code: z.string(),
                        name: z.string(),
                        type: z.string(),
                        stock: z.number(),
                        currency: z.string(),
                        net1: z.number(),
                        net2: z.number(),
                        net3: z.number(),
                        net4: z.number(),
                        net5: z.number(),
                        net6: z.number(),
                        net7: z.number(),
                        height: z.number().optional(),
                        length: z.number().optional(),
                        width: z.number().optional(),
                        weight: z.number().optional(),
                        createdAt: z.number(),
                        updatedAt: z.number(),
                        image: z.string().optional(),
                        supersededBy: z.string().optional(),
                      })
                      .nullable(),
                  })
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      500: {
        description: 'Server error',
      },
    },
  }),
  zValidator('query', listProductsQuerySchema, validationHook),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const { products, total } = await listProducts(query);

      return c.json({
        success: true,
        data: products,
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      console.error('[Products API] Error listing products:', error);
      return c.json(
        {
          success: false,
          message: 'Failed to fetch products',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  }
);

// Get Product Counts by Type
productsRoutes.get(
  '/count',
  authenticate,
  describeRoute({
    tags: ['Products'],
    summary: 'Get product counts by type',
    description: 'Returns the count of products grouped by type (All, Aftermarket, Genuine, Branded) for the given search query',
    responses: {
      200: {
        description: 'Product counts by type',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  all: z.number(),
                  aftermarket: z.number(),
                  genuine: z.number(),
                  branded: z.number(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      500: {
        description: 'Server error',
      },
    },
  }),
  zValidator('query', productCountQuerySchema, validationHook),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const counts = await getProductCounts(query);

      return c.json({
        success: true,
        data: counts,
      });
    } catch (error) {
      console.error('[Products Count API] Error getting counts:', error);
      return c.json(
        {
          success: false,
          message: 'Failed to fetch product counts',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  }
);

// Get Single Product by ID (Admin only)
productsRoutes.get(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['Products'],
    summary: 'Get product by ID',
    description: 'Get detailed product information by ID (Admin only)',
    responses: {
      200: {
        description: 'Product details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  code: z.string(),
                  name: z.string(),
                  type: z.string(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  status: z.boolean(),
                  image: z.string().nullable(),
                  price: z.object({
                    net1: z.number(),
                    net2: z.number(),
                    net3: z.number(),
                    net4: z.number(),
                    net5: z.number(),
                    net6: z.number(),
                    net7: z.number(),
                    currency: z.string(),
                  }).nullable(),
                  stock: z.object({
                    stock: z.number(),
                  }).nullable(),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: 'Product not found',
      },
    },
  }),
  zValidator('param', productIdParamSchema, validationHook),
  async (c) => {
    const productId = parseInt(c.req.param('id'));

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        prices: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stocks: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Fetch product image
    const productImage = await prisma.productImages.findFirst({
      where: {
        productCode: product.code,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const price = product.prices[0] || null;
    const stock = product.stocks[0] || null;

    return c.json(successResponse({
      id: product.id,
      code: product.code,
      name: product.name,
      type: product.type,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      status: product.status,
      image: productImage?.image || null,
      price: price ? {
        net1: Number(price.net1),
        net2: Number(price.net2),
        net3: Number(price.net3),
        net4: Number(price.net4),
        net5: Number(price.net5),
        net6: Number(price.net6),
        net7: Number(price.net7),
        currency: price.currency,
      } : null,
      stock: stock ? {
        stock: stock.stock,
      } : null,
    }), 200);
  }
);

// Update Product (Admin only)
productsRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['Products'],
    summary: 'Update product',
    description: 'Update product details (Admin only). Automatically updates TypeSense search index in real-time.',
    responses: {
      200: {
        description: 'Product updated successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  code: z.string(),
                  name: z.string(),
                  type: z.string(),
                  updatedAt: z.string(),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: 'Product not found',
      },
    },
  }),
  zValidator('param', productIdParamSchema, validationHook),
  zValidator('json', updateProductSchema, validationHook),
  async (c) => {
    const productId = parseInt(c.req.param('id'));
    const input = c.req.valid('json');
    const { name, type, supplierCode, height, length, width, weight, stock, net1, net2, net3, net4, net5, net6, net7, image } = input;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        prices: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stocks: {
          where: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!existingProduct) {
      throw new NotFoundError('Product not found');
    }

    // Update product in a transaction
    const updatedProduct = await prisma.$transaction(async (tx) => {
      // Update basic product info
      const product = await tx.product.update({
        where: { id: productId },
        data: {
          ...(name && { name }),
          ...(type && { type }),
          ...(supplierCode !== undefined && { supplierCode }),
          ...(height !== undefined && { height }),
          ...(length !== undefined && { length }),
          ...(width !== undefined && { width }),
          ...(weight !== undefined && { weight }),
        },
      });

      // Update stock if provided
      if (stock !== undefined) {
        const currentStock = existingProduct.stocks[0];
        if (currentStock) {
          await tx.productStock.update({
            where: { id: currentStock.id },
            data: { stock },
          });
        } else {
          await tx.productStock.create({
            data: {
              productId: product.id,
              stock,
            },
          });
        }
      }

      // Update prices if any price is provided
      if (net1 !== undefined || net2 !== undefined || net3 !== undefined ||
          net4 !== undefined || net5 !== undefined || net6 !== undefined || net7 !== undefined) {
        const currentPrice = existingProduct.prices[0];
        const priceData = {
          net1: net1 !== undefined ? net1 : (currentPrice ? Number(currentPrice.net1) : 0),
          net2: net2 !== undefined ? net2 : (currentPrice ? Number(currentPrice.net2) : 0),
          net3: net3 !== undefined ? net3 : (currentPrice ? Number(currentPrice.net3) : 0),
          net4: net4 !== undefined ? net4 : (currentPrice ? Number(currentPrice.net4) : 0),
          net5: net5 !== undefined ? net5 : (currentPrice ? Number(currentPrice.net5) : 0),
          net6: net6 !== undefined ? net6 : (currentPrice ? Number(currentPrice.net6) : 0),
          net7: net7 !== undefined ? net7 : (currentPrice ? Number(currentPrice.net7) : 0),
        };

        if (currentPrice) {
          await tx.productPrice.update({
            where: { id: currentPrice.id },
            data: priceData,
          });
        } else {
          await tx.productPrice.create({
            data: {
              productId: product.id,
              ...priceData,
            },
          });
        }
      }

      // Handle image update
      if (image !== undefined) {
        // Find existing image
        const existingImage = await tx.productImages.findFirst({
          where: {
            productCode: product.code,
            status: true,
          },
        });

        if (image === null || image === '') {
          // Delete existing image if image is null or empty string
          if (existingImage) {
            await tx.productImages.update({
              where: { id: existingImage.id },
              data: { status: false },
            });
          }
        } else {
          // Update or create image
          if (existingImage) {
            await tx.productImages.update({
              where: { id: existingImage.id },
              data: { image },
            });
          } else {
            await tx.productImages.create({
              data: {
                productCode: product.code,
                image,
              },
            });
          }
        }
      }

      return product;
    });

    // Update product in TypeSense (async, don't await)
    updateProductInTypesense(updatedProduct.code).catch((error) => {
      console.error('[Product Update] Failed to update TypeSense:', error);
    });

    return c.json(successResponse({
      id: updatedProduct.id,
      code: updatedProduct.code,
      name: updatedProduct.name,
      type: updatedProduct.type,
      updatedAt: updatedProduct.updatedAt,
    }), 200);
  }
);

export default productsRoutes;
