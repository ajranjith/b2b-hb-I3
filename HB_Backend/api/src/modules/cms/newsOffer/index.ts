import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role, NewsOffersType } from 'generated/prisma';
import { createNewsOfferSchema, updateNewsOfferSchema, listNewsOffersQuerySchema } from './_dto';
import { createNewsOffer, getAllNewsOffers, getNewsOfferById, updateNewsOffer, deleteNewsOffer } from './_service';
import { validationHook } from '@/middleware/validationHook';

const newsOfferRoutes = new Hono();

// Get all news/offers (Admin and Dealer can access)
newsOfferRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['CMS - News/Offers'],
    summary: 'Get all active news and offers',
    description: `Get a paginated list of all active news and offers. Available to both Admin and Dealer users.

**Features:**
- Returns only active items (status: true)
- **filterType:**
  - If filterType=admin or not provided: Shows all active items without date filtering
  - If filterType=dealer: Only shows items where current date is within fromDate and toDate range
    - Items with no toDate (null) have no expiration and are always shown if fromDate is valid
    - Items with fromDate in the future are not shown
- Sorted by orderNo (ascending), then by createdAt (descending)
- Includes all news/offer details
- Supports pagination
- Optional filtering by type (News or Offers)

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- type: Filter by type - "News" or "Offers" (optional)
- filterType: Filter by access type - "admin" or "dealer" (optional, default: shows all)

**Examples:**

Get all news and offers:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/news-offers?page=1&limit=20"
\`\`\`

Filter by News only:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/news-offers?type=News&page=1&limit=20"
\`\`\`

Filter by Offers only:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/news-offers?type=Offers&page=1&limit=20"
\`\`\`

Get all items (Admin view - no date filtering):
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/news-offers?filterType=admin&page=1&limit=20"
\`\`\`

Get items with date filtering (Dealer view):
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/news-offers?filterType=dealer&page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of news and offers',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    type: z.nativeEnum(NewsOffersType),
                    title: z.string(),
                    description: z.string().nullable(),
                    longDescription: z.string().nullable(),
                    thumbnail: z.string(),
                    fileUpload: z.string().nullable(),
                    subtext: z.string().nullable(),
                    orderNo: z.number().nullable(),
                    fromDate: z.date(),
                    toDate: z.date().nullable(),
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
  zValidator('query', listNewsOffersQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const { newsOffers, total } = await getAllNewsOffers(query.page, query.limit, query.type, query.filterType);

    return c.json({
      success: true,
      data: newsOffers,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }
);

// Get news/offer by ID (Admin and Dealer can access)
newsOfferRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['CMS - News/Offers'],
    summary: 'Get news/offer by ID',
    description: `Get a specific news/offer by its ID. Available to both Admin and Dealer users.`,
    responses: {
      200: {
        description: 'News/Offer details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  type: z.nativeEnum(NewsOffersType),
                  title: z.string(),
                  description: z.string().nullable(),
                  longDescription: z.string().nullable(),
                  thumbnail: z.string(),
                  fileUpload: z.string().nullable(),
                  subtext: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  fromDate: z.date(),
                  toDate: z.date().nullable(),
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
        description: 'News/Offer not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid news/offer ID' });
    }

    const newsOffer = await getNewsOfferById(id);

    return c.json({
      success: true,
      data: newsOffer,
    });
  }
);

// Create news/offer (Admin only)
newsOfferRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - News/Offers'],
    summary: 'Create a new news/offer',
    description: `Create a new news or offer. Only Admin users can create items. OrderNo is automatically assigned based on existing items of the same type.

**Request Body:**
- type: Type of item - News or Offers (required)
- title: Title (required)
- description: Short description (optional)
- thumbnail: Thumbnail image URL (required)
- fileUpload: File/document URL for download (optional)
- subtext: Tag/label text (optional)
- fromDate: Start date (required) - Format: ISO 8601 date string (e.g., "2026-02-01")
- toDate: End date (optional) - Format: ISO 8601 date string (e.g., "2026-12-31"). If not provided, item has no expiration date.

**Note:** 
- orderNo is automatically incremented based on existing items of the same type.
- Date filtering only applies when filterType equals dealer is used in GET requests. Admin view shows all active items regardless of dates.`,
    responses: {
      201: {
        description: 'News/Offer created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  type: z.nativeEnum(NewsOffersType),
                  title: z.string(),
                  description: z.string().nullable(),
                  longDescription: z.string().nullable(),
                  thumbnail: z.string(),
                  fileUpload: z.string().nullable(),
                  subtext: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  fromDate: z.date(),
                  toDate: z.date().nullable(),
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
  zValidator('json', createNewsOfferSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');

    const newsOffer = await createNewsOffer(input);

    return c.json(
      {
        success: true,
        data: newsOffer,
      },
      201
    );
  }
);

// Update news/offer (Admin only)
newsOfferRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - News/Offers'],
    summary: 'Update a news/offer',
    description: `Update an existing news/offer. Only Admin users can update items.

**Request Body (all fields optional):**
- type: Type of item - News or Offers
- title: Title
- description: Short description
- thumbnail: Thumbnail image URL
- fileUpload: File/document URL for download
- subtext: Tag/label text
- orderNo: Display order number
- status: Active status (true/false)
- fromDate: Start date - Format: ISO 8601 date string (e.g., "2026-02-01")
- toDate: End date (optional) - Format: ISO 8601 date string (e.g., "2026-12-31"). Set to null to remove expiration date.`,
    responses: {
      200: {
        description: 'News/Offer updated successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  type: z.nativeEnum(NewsOffersType),
                  title: z.string(),
                  description: z.string().nullable(),
                  longDescription: z.string().nullable(),
                  thumbnail: z.string(),
                  fileUpload: z.string().nullable(),
                  subtext: z.string().nullable(),
                  orderNo: z.number().nullable(),
                  fromDate: z.date(),
                  toDate: z.date().nullable(),
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
        description: 'News/Offer not found',
      },
    },
  }),
  zValidator('json', updateNewsOfferSchema, validationHook),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const input = c.req.valid('json');

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid news/offer ID' });
    }

    const newsOffer = await updateNewsOffer(id, input);

    return c.json({
      success: true,
      data: newsOffer,
    });
  }
);

// Delete news/offer (Admin only)
newsOfferRoutes.delete(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - News/Offers'],
    summary: 'Delete a news/offer',
    description: `Delete (soft delete) a news/offer by setting its status to false. Only Admin users can delete items.`,
    responses: {
      200: {
        description: 'News/Offer deleted successfully',
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
        description: 'News/Offer not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid news/offer ID' });
    }

    await deleteNewsOffer(id);

    return c.json({
      success: true,
      message: 'News/Offer deleted successfully',
    });
  }
);

export default newsOfferRoutes;
