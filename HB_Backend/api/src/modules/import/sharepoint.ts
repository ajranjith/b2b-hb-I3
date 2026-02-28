import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate";
import { authorize } from "@/middleware/authorize";
import { Role } from "generated/prisma";
import { scheduledImportsService } from "@/services/scheduledImports";
import { prisma } from "@/lib/prisma";
import { validationHook } from "@/middleware/validationHook";

const sharepointImportRoutes = new Hono();

// Manual trigger endpoint for SharePoint imports
sharepointImportRoutes.post(
  "/trigger",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["Import", "SharePoint"],
    summary: "Manually trigger SharePoint import process",
    description: `Manually trigger the automated SharePoint import process.

**What it does:**
- Scans all configured SharePoint import folders
- Downloads new or modified Excel/CSV files
- Processes them using existing import logic
- Updates import logs with results

**Processing Order:**
1. Products
2. Superseded Mapping
3. Order Status
4. Backorders
5. Dealers

**Features:**
- Only processes new or modified files (tracks in database)
- Processes oldest files first within each folder
- Re-processes files if they've been modified since last import
- Uploads imported files to Azure for backup

**Note:** This endpoint is restricted to Admin users only.`,
    responses: {
      200: {
        description: "Import process completed",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.boolean(),
                data: z.object({
                  totalProcessed: z.number(),
                  results: z.array(
                    z.object({
                      type: z.string(),
                      processedCount: z.number(),
                      skippedCount: z.number(),
                      failedCount: z.number(),
                      errors: z.array(z.string()),
                    })
                  ),
                  errors: z.array(z.string()),
                  startTime: z.string(),
                  endTime: z.string(),
                  durationMs: z.number(),
                }),
              })
            ),
          },
        },
      },
      400: {
        description: "Import already running",
      },
      401: {
        description: "Authentication required",
      },
      403: {
        description: "Admin access required",
      },
      500: {
        description: "Import process failed",
      },
    },
  }),
  async (c) => {
    try {
      // Check if import is already running
      if (scheduledImportsService.isImportRunning()) {
        return c.json(
          {
            success: false,
            message: "Import is already running. Please wait for it to complete.",
          },
          400
        );
      }

      // Trigger the import
      const result = await scheduledImportsService.triggerManualImport();

      return c.json({
        success: result.success,
        data: {
          totalProcessed: result.totalProcessed,
          results: result.results,
          errors: result.errors,
          startTime: result.startTime.toISOString(),
          endTime: result.endTime.toISOString(),
          durationMs: result.durationMs,
        },
      });
    } catch (error: any) {
      console.error("[SharePoint Import API] Error:", error);
      return c.json(
        {
          success: false,
          message: "Failed to run import process",
          error: error.message,
        },
        500
      );
    }
  }
);

// Get import status endpoint
sharepointImportRoutes.get(
  "/status",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["Import", "SharePoint"],
    summary: "Check if SharePoint import is currently running",
    description: "Returns the current status of the automated SharePoint import process.",
    responses: {
      200: {
        description: "Import status retrieved",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  isRunning: z.boolean(),
                  message: z.string(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: "Authentication required",
      },
      403: {
        description: "Admin access required",
      },
    },
  }),
  async (c) => {
    const isRunning = scheduledImportsService.isImportRunning();

    return c.json({
      success: true,
      data: {
        isRunning,
        message: isRunning
          ? "Import process is currently running"
          : "No import process is currently running",
      },
    });
  }
);

// List import run logs
sharepointImportRoutes.get(
  "/runs",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["Import", "SharePoint"],
    summary: "List SharePoint import run logs",
    description: `Get paginated list of SharePoint import run logs with summary information.

**Features:**
- Shows when each import ran (CRON or MANUAL)
- Files found, processed, skipped, failed per run
- Duration and status of each run
- Detailed breakdown by import type (Products, Dealers, etc.)
- Pagination support

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)`,
    responses: {
      200: {
        description: "Paginated list of import runs",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    triggeredBy: z.enum(["CRON", "MANUAL"]),
                    status: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
                    startedAt: z.date(),
                    completedAt: z.date().nullable(),
                    durationMs: z.number().nullable(),
                    totalFilesFound: z.number(),
                    totalFilesProcessed: z.number(),
                    totalFilesSkipped: z.number(),
                    totalFilesFailed: z.number(),
                    results: z.any(),
                    errors: z.any(),
                    createdAt: z.date(),
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
        description: "Authentication required",
      },
      403: {
        description: "Admin access required",
      },
    },
  }),
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
    validationHook
  ),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.sharePointImportRun.count();

    // Get runs with pagination
    const runs = await prisma.sharePointImportRun.findMany({
      skip,
      take: limit,
      orderBy: { startedAt: "desc" },
    });

    return c.json({
      success: true,
      data: runs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

// Get single import run details
sharepointImportRoutes.get(
  "/runs/:runId",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["Import", "SharePoint"],
    summary: "Get detailed import run information",
    description: "Get detailed information about a specific SharePoint import run.",
    responses: {
      200: {
        description: "Import run details",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  triggeredBy: z.enum(["CRON", "MANUAL"]),
                  status: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
                  startedAt: z.date(),
                  completedAt: z.date().nullable(),
                  durationMs: z.number().nullable(),
                  totalFilesFound: z.number(),
                  totalFilesProcessed: z.number(),
                  totalFilesSkipped: z.number(),
                  totalFilesFailed: z.number(),
                  results: z.any(),
                  errors: z.any(),
                  createdAt: z.date(),
                }),
              })
            ),
          },
        },
      },
      404: {
        description: "Run not found",
      },
      401: {
        description: "Authentication required",
      },
      403: {
        description: "Admin access required",
      },
    },
  }),
  async (c) => {
    const runId = parseInt(c.req.param("runId"));

    const run = await prisma.sharePointImportRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return c.json(
        {
          success: false,
          message: "Import run not found",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: run,
    });
  }
);

export default sharepointImportRoutes;
