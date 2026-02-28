import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role } from 'generated/prisma';
import { createExclusivePartSchema, updateExclusivePartSchema } from './_dto';
import { createExclusivePart, getAllExclusiveParts, getExclusivePartById, updateExclusivePart, deleteExclusivePart } from './_service';
import { validationHook } from '@/middleware/validationHook';
import { join } from 'path';

const exclusivePartsRoutes = new Hono();

// Get all exclusive parts (Admin and Dealer can access)
exclusivePartsRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Get all exclusive parts',
    description: `Get a list of all exclusive parts. Available to both Admin and Dealer users.

**Features:**
- Returns all exclusive parts (both active and inactive)
- Sorted by status (active first), then by createdAt (descending)
- Includes all exclusive part details

**Example:**
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/exclusive-parts"
\`\`\``,
    responses: {
      200: {
        description: 'List of exclusive parts',
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
                    createdAt: z.date(),
                    updatedAt: z.date(),
                    status: z.boolean(),
                  })
                ),
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
  async (c) => {
    const exclusiveParts = await getAllExclusiveParts();

    return c.json({
      success: true,
      data: exclusiveParts,
    });
  }
);

// Get exclusive part by ID (Admin and Dealer can access)
exclusivePartsRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Get exclusive part by ID',
    description: `Get a specific exclusive part by its ID. Available to both Admin and Dealer users.`,
    responses: {
      200: {
        description: 'Exclusive part details',
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
        description: 'Exclusive part not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid exclusive part ID' });
    }

    const exclusivePart = await getExclusivePartById(id);

    return c.json({
      success: true,
      data: exclusivePart,
    });
  }
);

// Get Exclusive Parts PDF
exclusivePartsRoutes.get(
  '/pdf',
  authenticate,
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Get Exclusive Parts PDF',
    description: `Download the Exclusive Parts PDF file. Available to both Admin and Dealer users.

**Example:**

Download PDF:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/cms/exclusive-parts/pdf" \\
  --output exclusive-parts.pdf
\`\`\``,
    responses: {
      200: {
        description: 'PDF file',
        content: {
          'application/pdf': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
      404: {
        description: 'PDF file not found',
      },
    },
  }),
  async (c) => {
    const fileName = 'Exclusive-Parts.pdf';
    const filePath = join(process.cwd(), 'src', 'templates', 'pdf', fileName);

    // Check if file exists
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (!exists) {
        throw new HTTPException(404, { message: `PDF file not found: ${fileName}` });
      }

      // Read file as buffer
      const fileBuffer = await file.arrayBuffer();

      // Set headers for file download
      c.header('Content-Type', 'application/pdf');
      c.header('Content-Disposition', `attachment; filename="${fileName}"`);
      c.header('Content-Length', fileBuffer.byteLength.toString());

      // Return PDF file
      return c.body(new Uint8Array(fileBuffer));
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: `Failed to read PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
);

// Create exclusive part (Admin only)
exclusivePartsRoutes.post(
  '/',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Create a new exclusive part',
    description: `Create a new exclusive part. Only Admin users can create exclusive parts.

**Important:** When creating a new exclusive part, all other exclusive parts will automatically have their status set to false (only one can be active at a time).

**Request Body:**
- title: Exclusive part title (required)
- description: Exclusive part description (required)
- imgae: Image URL (required)`,
    responses: {
      201: {
        description: 'Exclusive part created successfully',
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
  zValidator('json', createExclusivePartSchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');

    const exclusivePart = await createExclusivePart(input);

    return c.json(
      {
        success: true,
        data: exclusivePart,
      },
      201
    );
  }
);

// Update exclusive part (Admin only)
exclusivePartsRoutes.put(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Update an exclusive part',
    description: `Update an existing exclusive part. Only Admin users can update exclusive parts.

**Important:** If you set status to true, all other exclusive parts will automatically have their status set to false (only one can be active at a time).

**Request Body (all fields optional):**
- title: Exclusive part title
- description: Exclusive part description
- imgae: Image URL
- status: Active status (true/false)`,
    responses: {
      200: {
        description: 'Exclusive part updated successfully',
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
        description: 'Exclusive part not found',
      },
    },
  }),
  zValidator('json', updateExclusivePartSchema, validationHook),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const input = c.req.valid('json');

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid exclusive part ID' });
    }

    const exclusivePart = await updateExclusivePart(id, input);

    return c.json({
      success: true,
      data: exclusivePart,
    });
  }
);

// Delete exclusive part (Admin only)
exclusivePartsRoutes.delete(
  '/:id',
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ['CMS - Exclusive Parts'],
    summary: 'Delete an exclusive part',
    description: `Delete (soft delete) an exclusive part by setting its status to false. Only Admin users can delete exclusive parts.`,
    responses: {
      200: {
        description: 'Exclusive part deleted successfully',
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
        description: 'Exclusive part not found',
      },
    },
  }),
  async (c) => {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid exclusive part ID' });
    }

    await deleteExclusivePart(id);

    return c.json({
      success: true,
      message: 'Exclusive part deleted successfully',
    });
  }
);

export default exclusivePartsRoutes;
