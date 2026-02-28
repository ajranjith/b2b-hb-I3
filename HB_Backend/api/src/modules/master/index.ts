import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { successResponse } from '../../utils/response';
import { DealerTier, ProductType, DealerAccountStatus } from '../../../generated/prisma';

const masterRoutes = new Hono();

// List User Roles
masterRoutes.get(
  '/roles',
  describeRoute({
    tags: ['Master'],
    summary: 'List user roles',
    description: 'Get all user roles',
    responses: {
      200: {
        description: 'List of user roles',
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
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const roles = await prisma.userRole.findMany({
      where: { status: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return c.json(successResponse(roles));
  }
);

// List Dealer Tiers
masterRoutes.get(
  '/tiers',
  describeRoute({
    tags: ['Master'],
    summary: 'List dealer tiers',
    description: 'Get all dealer tiers',
    responses: {
      200: {
        description: 'List of dealer tiers',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    code: z.string(),
                    name: z.string(),
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const tierLabels: Record<DealerTier, string> = {
      Net1: 'T_Retail_Price',
      Net2: 'N1_Trade_Price',
      Net3: 'N2_Band_1',
      Net4: 'N3_Band_2',
      Net5: 'N4_Band_3',
      Net6: 'N5_Band_4',
      Net7: 'L_List_price',
    };

    const tiers = Object.values(DealerTier).map((tier) => ({
      code: tier,
      name: tierLabels[tier],
    }));

    return c.json(successResponse(tiers));
  }
);

// List Dispatch Methods (Shipping Methods)
masterRoutes.get(
  '/dispatch_methods',
  describeRoute({
    tags: ['Master'],
    summary: 'List dispatch methods',
    description: 'Get all dispatch/shipping methods',
    responses: {
      200: {
        description: 'List of dispatch methods',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    name: z.string(),
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const methods = await prisma.shippingMethod.findMany({
      where: { status: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return c.json(successResponse(methods));
  }
);

// List Product Types
masterRoutes.get(
  '/product_types',
  describeRoute({
    tags: ['Master'],
    summary: 'List product types',
    description: 'Get all product types',
    responses: {
      200: {
        description: 'List of product types',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    code: z.string(),
                    name: z.string(),
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const types = Object.values(ProductType).map((type) => ({
      code: type,
      name: type,
    }));

    return c.json(successResponse(types));
  }
);

// List Dealer Account Statuses
masterRoutes.get(
  '/dealer_statuses',
  describeRoute({
    tags: ['Master'],
    summary: 'List dealer account statuses',
    description: 'Get all dealer account statuses',
    responses: {
      200: {
        description: 'List of dealer account statuses',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    code: z.string(),
                    name: z.string(),
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const statuses = Object.values(DealerAccountStatus).map((status) => ({
      code: status,
      name: status,
    }));

    return c.json(successResponse(statuses));
  }
);

export default masterRoutes;
