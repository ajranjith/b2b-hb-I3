import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { syncProductsToTypesense } from '@/services/typesenseSync';

const syncRoutes = new Hono();

// Sync Products to TypeSense (Blue-Green Deployment)
syncRoutes.post(
  '/typesense',
  describeRoute({
    tags: ['Sync'],
    summary: 'Sync products to TypeSense search engine',
    description: `Performs a full sync of products to TypeSense using Blue-Green deployment for zero downtime.

**Blue-Green Deployment Strategy:**
- Creates a new collection with timestamp
- Syncs all products to the new collection
- Updates alias to point to new collection
- Deletes old collection after successful switch
- **Zero downtime** - search remains available during sync

**What Gets Synced:**
- All active products with current prices and stock
- Product images (if available)
- Superseded product mappings
- ~700,000 products typically take 6-10 minutes

**When to Use:**
- After daily product imports
- After uploading product images
- Manual sync when needed
- Scheduled via cron for daily sync

**Note:** This is a long-running operation. The response returns immediately, but sync continues in background.`,
    responses: {
      200: {
        description: 'Sync started successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  stage: z.string(),
                  supersededLoaded: z.number(),
                  productsProcessed: z.number(),
                  totalProducts: z.number(),
                  newCollection: z.string().optional(),
                  oldCollection: z.string().optional(),
                  durationMs: z.number().optional(),
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
        description: 'Sync failed',
      },
    },
  }),
  async (c) => {
    console.log('[API] Starting TypeSense sync...');

    // Run sync (not awaiting - returns immediately)
    syncProductsToTypesense((progress) => {
      console.log(
        `[Sync Progress] ${progress.stage}: ${progress.message} (${progress.productsProcessed}/${progress.totalProducts})`
      );
    })
      .then((result) => {
        if (result.success) {
          console.log(
            `[API] TypeSense sync completed successfully: ${result.totalProducts} products in ${(result.durationMs / 1000 / 60).toFixed(2)} minutes`
          );
        } else {
          console.error(`[API] TypeSense sync failed: ${result.error}`);
        }
      })
      .catch((error) => {
        console.error('[API] TypeSense sync error:', error);
      });

    // Return immediately
    return c.json({
      success: true,
      message: 'TypeSense sync started in background',
      data: {
        stage: 'started',
        supersededLoaded: 0,
        productsProcessed: 0,
        totalProducts: 0,
        message: 'Sync started. Monitor server logs for progress.',
      },
    });
  }
);

export default syncRoutes;
