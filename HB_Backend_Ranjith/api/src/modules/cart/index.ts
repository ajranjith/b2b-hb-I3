import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { validationHook } from '@/middleware/validationHook';
import { addToCartSchema, updateCartItemSchema, removeCartItemSchema } from './_dto';
import {
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  getCart,
  getCartItemCount,
} from './_services';

const cartRoutes = new Hono();

// Get cart item count (fast)
cartRoutes.get(
  '/count',
  authenticate,
  describeRoute({
    tags: ['Cart'],
    summary: 'Get cart item count',
    description: 'Fast endpoint that returns only the number of items in cart',
    responses: {
      200: {
        description: 'Cart item count',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  count: z.number(),
                }),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const count = await getCartItemCount(user.id);

    return c.json({
      success: true,
      data: { count },
    });
  }
);

// Get cart with items and summary
cartRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['Cart'],
    summary: 'Get cart',
    description: 'Get user cart with items, pricing, and summary',
    responses: {
      200: {
        description: 'Cart details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number().nullable(),
                  items: z.array(z.any()),
                  summary: z.object({
                    itemCount: z.number(),
                    totalQuantity: z.number(),
                    subtotal: z.number(),
                    total: z.number(),
                    formattedSubtotal: z.string(),
                    formattedTotal: z.string(),
                    currency: z.string(),
                  }),
                }),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const cart = await getCart(user.id);

    return c.json({
      success: true,
      data: cart,
    });
  }
);

// Add to cart
cartRoutes.post(
  '/items',
  authenticate,
  describeRoute({
    tags: ['Cart'],
    summary: 'Add product to cart',
    description: 'Add a product to cart by product code. If product already exists, quantity is increased.',
    responses: {
      200: {
        description: 'Product added to cart',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  cartItemId: z.number(),
                  quantity: z.number(),
                  added: z.boolean(),
                }),
              })
            ),
          },
        },
      },
      404: {
        description: 'Product not found',
      },
    },
  }),
  zValidator('json', addToCartSchema, validationHook),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const result = await addToCart(user.id, input);

    return c.json({
      success: true,
      message: result.added ? 'Product added to cart' : 'Cart quantity updated',
      data: result,
    });
  }
);

// Update cart item quantity
cartRoutes.patch(
  '/items',
  authenticate,
  describeRoute({
    tags: ['Cart'],
    summary: 'Update cart item quantity',
    description: 'Update quantity of a product in cart. Set quantity to 0 to remove the item.',
    responses: {
      200: {
        description: 'Cart item updated',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  quantity: z.number().optional(),
                  removed: z.boolean(),
                }),
              })
            ),
          },
        },
      },
      404: {
        description: 'Product or cart item not found',
      },
    },
  }),
  zValidator('json', updateCartItemSchema, validationHook),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const result = await updateCartItemQuantity(user.id, input);

    return c.json({
      success: true,
      message: result.removed ? 'Item removed from cart' : 'Quantity updated',
      data: result,
    });
  }
);

// Remove cart item
cartRoutes.delete(
  '/items',
  authenticate,
  describeRoute({
    tags: ['Cart'],
    summary: 'Remove item from cart',
    description: 'Remove a product from cart by product code',
    responses: {
      200: {
        description: 'Item removed from cart',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              })
            ),
          },
        },
      },
      404: {
        description: 'Product or cart item not found',
      },
    },
  }),
  zValidator('json', removeCartItemSchema, validationHook),
  async (c) => {
    const user = c.get('user');
    const { productCode } = c.req.valid('json');

    await removeCartItem(user.id, productCode);

    return c.json({
      success: true,
      message: 'Item removed from cart',
    });
  }
);

export default cartRoutes;
