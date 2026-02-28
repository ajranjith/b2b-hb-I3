import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role } from 'generated/prisma';
import { createBannerSchema, updateBannerSchema, listBannersQuerySchema } from './_dto';
import { createBanner, getAllBanners, getBannerById, updateBanner, deleteBanner } from './_service';
import { validationHook } from '@/middleware/validationHook';

const bannerRoutes = new Hono();

// Get all banners (Admin and Dealer can access)
bannerRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['CMS - Banner'],
    summary: 'Get all active banners',
    description: `Get a paginated list of all active banners. Available to both Admin and Dealer users.

**Features:**
- Returns only active banners (status: true)
- Sorted by orderNo (ascending), then by createdAt (descending)
- Includes all banner details
- Supports pagination

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)

**Example:**
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/banner?page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of banners',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    title: z.string(),
                    description: z.string(),
                    imgae: z.string(),
                    link: z.string().nullable(),
                    orderNo: z.number().nullable(),
                    createdAt: z.date(),
                    updatedAt: z.date(),
                    status: z.boolean(),
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
    },
  }),
  zValidator('query', listBannersQuerySchema, validationHook),
  async (c) => {
    const query = c.req.valid('query');
    const { banners, total } = await getAllBanners(query.page, query.limit, query.type);

    return c.json({
      success: true,
      data: banners,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }
);

// Get banner by ID (Admin and Dealer can access)
bannerRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['CMS - Banner'],
    summary: 'Get banner by ID',
    description: `Get a specific banner by its ID. Available to both Admin and Dealer users.`,
    responses: {
      200: {
        description: 'Banner details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  title: z.string(),
                  description: z.string(),
                  imgae: z.string(),
                  link: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  createdAt: z.date(),
                  updatedAt: z.date(),
                  status: z.boolean(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      404: {
        description: 'Banner not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid banner ID' });
    }

    const banner = await getBannerById(id);

    return c.json({
      success: true,
      data: banner,
    });
  }
);

// Create banner (Admin only)
bannerRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Banner'],
    summary: 'Create a new banner',
    description: `Create a new banner. Only Admin users can create banners.

**Request Body:**
- title: Banner title (required)
- description: Banner description (required)
- imgae: Image URL (required)
- link: Banner link URL (optional)
- orderNo: Display order number (optional)`,
    responses: {
      201: {
        description: 'Banner created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  title: z.string(),
                  description: z.string(),
                  imgae: z.string(),
                  link: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  createdAt: z.date(),
                  updatedAt: z.date(),
                  status: z.boolean(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      403: {
        description: 'Admin access required',
      },
    },
  }),
  zValidator('json', createBannerSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');

    const banner = await createBanner(input);

    return c.json(
      {
        success: true,
        data: banner,
      },
      201
    );
  }
);

// Update banner (Admin only)
bannerRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Banner'],
    summary: 'Update a banner',
    description: `Update an existing banner. Only Admin users can update banners.

**Request Body (all fields optional):**
- title: Banner title
- description: Banner description
- imgae: Image URL
- link: Banner link URL
- orderNo: Display order number
- status: Active status (true/false)`,
    responses: {
      200: {
        description: 'Banner updated successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  title: z.string(),
                  description: z.string(),
                  imgae: z.string(),
                  link: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  createdAt: z.date(),
                  updatedAt: z.date(),
                  status: z.boolean(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      403: {
        description: 'Admin access required',
      },
      404: {
        description: 'Banner not found',
      },
    },
  }),
  zValidator('json', updateBannerSchema, validationHook),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const input = c.req.valid('json');

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid banner ID' });
    }

    const banner = await updateBanner(id, input);

    return c.json({
      success: true,
      data: banner,
    });
  }
);

// Delete banner (Admin only)
bannerRoutes.delete(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Banner'],
    summary: 'Delete a banner',
    description: `Delete (soft delete) a banner by setting its status to false. Only Admin users can delete banners.`,
    responses: {
      200: {
        description: 'Banner deleted successfully',
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
      401: {
        description: 'Authentication required',
      },
      403: {
        description: 'Admin access required',
      },
      404: {
        description: 'Banner not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid banner ID' });
    }

    await deleteBanner(id);

    return c.json({
      success: true,
      message: 'Banner deleted successfully',
    });
  }
);

export default bannerRoutes;
