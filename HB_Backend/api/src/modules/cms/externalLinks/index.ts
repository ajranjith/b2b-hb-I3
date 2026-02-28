import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role } from 'generated/prisma';
import { createExternalLinkSchema, updateExternalLinkSchema, listExternalLinksQuerySchema } from './_dto';
import { createExternalLink, getAllExternalLinks, getExternalLinkById, updateExternalLink, deleteExternalLink } from './_service';
import { validationHook } from '@/middleware/validationHook';

const externalLinkRoutes = new Hono();

// Get all external links (Admin and Dealer can access)
externalLinkRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['CMS - External Links'],
    summary: 'Get all active external links',
    description: `Get a paginated list of all active external links. Available to both Admin and Dealer users.

**Features:**
- Returns only active links (status: true)
- Sorted by orderNo (ascending), then by createdAt (descending)
- Includes all external link details
- Supports pagination

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)

**Example:**
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/external-links?page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of external links',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    image: z.string(),
                    title: z.string(),
                    link: z.string(),
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
  zValidator('query', listExternalLinksQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const { externalLinks, total } = await getAllExternalLinks(query.page, query.limit);

    return c.json({
      success: true,
      data: externalLinks,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }
);

// Get external link by ID (Admin and Dealer can access)
externalLinkRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['CMS - External Links'],
    summary: 'Get external link by ID',
    description: `Get a specific external link by its ID. Available to both Admin and Dealer users.`,
    responses: {
      200: {
        description: 'External link details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  image: z.string(),
                  title: z.string(),
                  link: z.string(),
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
        description: 'External link not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid external link ID' });
    }

    const externalLink = await getExternalLinkById(id);

    return c.json({
      success: true,
      data: externalLink,
    });
  }
);

// Create external link (Admin only)
externalLinkRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - External Links'],
    summary: 'Create a new external link',
    description: `Create a new external link. Only Admin users can create links. OrderNo is automatically assigned based on existing links.

**Request Body:**
- image: Image URL (required)
- title: Title (required)
- link: Link URL (required)

**Note:** orderNo is automatically incremented based on existing links.`,
    responses: {
      201: {
        description: 'External link created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  image: z.string(),
                  title: z.string(),
                  link: z.string(),
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
  zValidator('json', createExternalLinkSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');

    const externalLink = await createExternalLink(input);

    return c.json(
      {
        success: true,
        data: externalLink,
      },
      201
    );
  }
);

// Update external link (Admin only)
externalLinkRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - External Links'],
    summary: 'Update an external link',
    description: `Update an existing external link. Only Admin users can update links.

**Request Body (all fields optional):**
- image: Image URL
- title: Title
- link: Link URL
- orderNo: Display order number
- status: Active status (true/false)`,
    responses: {
      200: {
        description: 'External link updated successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  image: z.string(),
                  title: z.string(),
                  link: z.string(),
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
        description: 'External link not found',
      },
    },
  }),
  zValidator('json', updateExternalLinkSchema, validationHook),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const input = c.req.valid('json');

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid external link ID' });
    }

    const externalLink = await updateExternalLink(id, input);

    return c.json({
      success: true,
      data: externalLink,
    });
  }
);

// Delete external link (Admin only)
externalLinkRoutes.delete(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - External Links'],
    summary: 'Delete an external link',
    description: `Delete (soft delete) an external link by setting its status to false. Only Admin users can delete links.`,
    responses: {
      200: {
        description: 'External link deleted successfully',
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
        description: 'External link not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid external link ID' });
    }

    await deleteExternalLink(id);

    return c.json({
      success: true,
      message: 'External link deleted successfully',
    });
  }
);

export default externalLinkRoutes;
