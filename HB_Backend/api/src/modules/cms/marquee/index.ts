import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role } from 'generated/prisma';
import { createMarqueeSchema, updateMarqueeSchema, listMarqueesQuerySchema } from './_dto';
import { createMarquee, getAllMarquees, getMarqueeById, updateMarquee, deleteMarquee } from './_service';
import { validationHook } from '@/middleware/validationHook';

const marqueeRoutes = new Hono();

// Get all marquees (Admin and Dealer can access)
marqueeRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['CMS - Marquee'],
    summary: 'Get all marquees',
    description: `Get a paginated list of marquees. Available to both Admin and Dealer users.

**Features:**
- Returns marquees sorted by createdAt (descending)
- Includes all marquee details
- Supports pagination
- Optional status filter

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- status: Filter by status (optional, true/false)

**Example:**
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/marquee?page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of marquees',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    text: z.string(),
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
  zValidator('query', listMarqueesQuerySchema, validationHook),
  async (c) => {
    const query = c.req.valid('query');
    const { marquees, total } = await getAllMarquees(query.page, query.limit, query.status);

    return c.json({
      success: true,
      data: marquees,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }
);

// Get marquee by ID (Admin and Dealer can access)
marqueeRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['CMS - Marquee'],
    summary: 'Get marquee by ID',
    description: `Get a specific marquee by its ID. Available to both Admin and Dealer users.`,
    responses: {
      200: {
        description: 'Marquee details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  text: z.string(),
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
        description: 'Marquee not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid marquee ID' });
    }

    const marquee = await getMarqueeById(id);

    return c.json({
      success: true,
      data: marquee,
    });
  }
);

// Create marquee (Admin only)
marqueeRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Marquee'],
    summary: 'Create a new marquee',
    description: `Create a new marquee. Only Admin users can create marquees.

**Request Body:**
- text: Marquee text (required)
- status: Active status (optional, default: true)`,
    responses: {
      201: {
        description: 'Marquee created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  text: z.string(),
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
  zValidator('json', createMarqueeSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');

    const marquee = await createMarquee(input);

    return c.json(
      {
        success: true,
        data: marquee,
      },
      201
    );
  }
);

// Update marquee (Admin only)
marqueeRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Marquee'],
    summary: 'Update a marquee',
    description: `Update an existing marquee. Only Admin users can update marquees.

**Request Body (all fields optional):**
- text: Marquee text
- status: Active status (true/false)`,
    responses: {
      200: {
        description: 'Marquee updated successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  text: z.string(),
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
        description: 'Marquee not found',
      },
    },
  }),
  zValidator('json', updateMarqueeSchema, validationHook),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const input = c.req.valid('json');

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid marquee ID' });
    }

    const marquee = await updateMarquee(id, input);

    return c.json({
      success: true,
      data: marquee,
    });
  }
);

// Delete marquee (Admin only)
marqueeRoutes.delete(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Marquee'],
    summary: 'Delete a marquee',
    description: `Delete (soft delete) a marquee by setting its status to false. Only Admin users can delete marquees.`,
    responses: {
      200: {
        description: 'Marquee deleted successfully',
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
        description: 'Marquee not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid marquee ID' });
    }

    await deleteMarquee(id);

    return c.json({
      success: true,
      message: 'Marquee deleted successfully',
    });
  }
);

export default marqueeRoutes;
