import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import sharepointImportRoutes from "./sharepoint";
import {
  importDealers,
  listImports,
  getImportErrors,
  getImportStats,
  exportImportErrorsToExcel,
} from "./_services";
import { importProducts } from "./_services.products";
import { importSuperseded } from "./_services.superseded";
import { importBackOrders } from "./_services.backorder";
import { importOrderStatus } from "./_services.orderstatus";
import {
  importResultSchema,
  listImportsQuerySchema,
  getTemplateSchema,
  getImportErrorsQuerySchema,
} from "./_dto";
import { validateFile, getFileBuffer } from "@/utils/fileUpload";
import { authenticate } from "@/middleware/authenticate";
import { jobManager } from "@/lib/jobManager";
import { prisma } from "@/lib/prisma";
import {
  preValidateProductsFile,
  preValidateDealersFile,
  preValidateSupersededFile,
  preValidateBackOrderFile,
  preValidateOrderStatusFile,
} from "@/utils/importValidation";
import { ImportStatus } from "generated/prisma";
import { extractFileFromFormData, uploadAndSaveImportFile } from "./_utils";
import { syncProductsToTypesense } from "@/services/typesenseSync";
import { join } from "path";

const importRoutes = new Hono();

// Mount SharePoint import routes
importRoutes.route("/sharepoint", sharepointImportRoutes);

// Get Import Job Status
importRoutes.get(
  "/status/:jobId",
  describeRoute({
    tags: ["Import"],
    summary: "Get import job status",
    description: "Check the status and progress of a background import job",
    responses: {
      200: {
        description: "Job status retrieved",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  jobId: z.number(),
                  status: z.enum([
                    "pending",
                    "processing",
                    "completed",
                    "failed",
                  ]),
                  progress: z.object({
                    current: z.number(),
                    total: z.number(),
                    percentage: z.number(),
                  }),
                  startedAt: z.string(),
                  completedAt: z.string().optional(),
                  error: z.string().optional(),
                  results: z
                    .object({
                      totalRows: z.number(),
                      successCount: z.number(),
                      errorCount: z.number(),
                    })
                    .optional(),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: "Job not found",
      },
    },
  }),
  async (c) => {
    const jobId = parseInt(c.req.param("jobId"));

    if (isNaN(jobId)) {
      throw new HTTPException(400, { message: "Invalid job ID" });
    }

    // Get job from manager
    const job = jobManager.getJob(jobId);

    // Get import log from database
    const importLog = await prisma.importLog.findUnique({
      where: { id: jobId },
    });

    console.log("importLog", importLog);

    if (!importLog) {
      throw new HTTPException(404, { message: "Job not found" });
    }

    // Combine data from job manager and database
    return c.json({
      success: true,
      data: {
        jobId: importLog.id,
        status: importLog.importStatus.toLowerCase(),
        progress: job
          ? job.progress
          : {
              current: importLog.successCount,
              total: importLog.totalRows,
              percentage:
                importLog.totalRows > 0
                  ? Math.round(
                      (importLog.successCount / importLog.totalRows) * 100,
                    )
                  : 0,
            },
        startedAt: importLog.createdAt.toISOString(),
        completedAt: importLog.completedAt?.toISOString(),
        error: job?.error,
        ...(importLog.completedAt && {
          results: {
            totalRows: importLog.totalRows,
            successCount: importLog.successCount,
            errorCount: importLog.errorCount,
          },
        }),
      },
    });
  },
);

// Get Imports with Import Logs with Status Filter and Pagination
importRoutes.get(
  "/",
  authenticate,
  describeRoute({
    tags: ["Import"],
    summary: "List imports with import logs, pagination and status filtering",
    description: `Get paginated list of imports with their error logs. Supports filtering by status and type.

**Features:**
- Filter by import status (PENDING, PROCESSING, COMPLETED, FAILED)
- Filter by import type (PARTS, DEALERS, SUPERSEDED, BACKORDER, ORDER_STATUS)
- Pagination with accurate counts
- Includes error logs for each import (limited to 100 errors per import)
- Sorted by latest import first
- Includes user information who performed the import

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- status: Filter by import status (optional) - PENDING, PROCESSING, COMPLETED, FAILED
- type: Filter by import type (optional) - PARTS, DEALERS, SUPERSEDED, BACKORDER, ORDER_STATUS

**Examples:**

Get all imports:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import?page=1&limit=20"
\`\`\`

Filter by status:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import?status=COMPLETED&page=1&limit=20"
\`\`\`

Filter by type:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import?type=PARTS&page=1&limit=20"
\`\`\`

Filter by both status and type:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import?status=FAILED&type=PARTS&page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: "Paginated list of imports with error logs",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    type: z.enum([
                      "PARTS",
                      "DEALERS",
                      "SUPERSEDED",
                      "BACKORDER",
                      "ORDER_STATUS",
                    ]),
                    importStatus: z.enum([
                      "PENDING",
                      "PROCESSING",
                      "COMPLETED",
                      "FAILED",
                    ]),
                    fileName: z.string(),
                    fileSize: z.number(),
                    totalRows: z.number(),
                    successCount: z.number(),
                    errorCount: z.number(),
                    importedBy: z
                      .object({
                        id: z.number(),
                        name: z.string(),
                        email: z.string(),
                      })
                      .nullable(),
                    startedAt: z.date(),
                    completedAt: z.date().nullable(),
                    durationMs: z.number().nullable(),
                    createdAt: z.date(),
                    updatedAt: z.date(),
                    errors: z.array(
                      z.object({
                        id: z.number(),
                        rowNumber: z.number(),
                        rowData: z.any(),
                        errors: z.array(z.string()),
                        createdAt: z.date(),
                      }),
                    ),
                  }),
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              }),
            ),
          },
        },
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  zValidator("query", listImportsQuerySchema),
  async (c) => {
    const query = c.req.valid("query");

    const { imports, total } = await listImports(query);

    return c.json({
      success: true,
      data: imports,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  },
);

// Import Dealers
importRoutes.post(
  "/dealers",
  describeRoute({
    tags: ["Import"],
    summary: "Import dealers",
    description: `Upload an Excel file (XLSX, XLS, or CSV) to import dealer accounts. Supports files up to 100MB.

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead:

\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/dealers.xlsx" \\
  http://localhost:3000/api/v1/import/dealers
\`\`\``,
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
                description: "Excel file containing dealer accounts",
              },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      200: {
        description: "Import completed with results",
        content: {
          "application/json": {
            schema: resolver(importResultSchema),
          },
        },
      },
      400: {
        description: "Invalid file or validation error",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  async (c) => {
    const user = c.get("user");

    // Extract and validate file
    const uploadedFile = await extractFileFromFormData(c);
    validateFile(uploadedFile);

    // Get file buffer
    const fileBuffer = await getFileBuffer(uploadedFile);

    // Pre-validate file structure (synchronous check)
    await preValidateDealersFile(fileBuffer);

    // Upload file to Azure (non-blocking, continues even if upload fails)
    const fileUrl = await uploadAndSaveImportFile(
      fileBuffer,
      uploadedFile.name,
      "DEALERS"
    );

    // Import dealers (all validation passed, proceed with import)
    const result = await importDealers(
      fileBuffer,
      uploadedFile.name,
      uploadedFile.size,
      user.id,
      fileUrl,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Import Products (Background Job)
importRoutes.post(
  "/products",
  describeRoute({
    tags: ["Import"],
    summary: "Import products (background job)",
    description: `Upload an Excel file (XLSX, XLS, or CSV) to import products with stock and pricing. Supports files up to 100MB.

**This endpoint runs as a background job:**
- Returns immediately with job ID
- Import processes in background
- Use GET /import/status/:jobId to check progress
- **Automatically syncs to TypeSense** after successful import

**Features:**
- Upserts products based on Product Code
- Archives old stock/price records (sets status=false)
- Creates new stock/price records for history tracking
- Automatically determines product type from discount code (gn=Genuine, es=Aftermarket, br=Branded)
- Processes in chunks for large files (700k+ rows supported)
- Auto-triggers TypeSense sync for immediate search availability

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead:

\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/products.xlsx" \\
  http://localhost:3000/api/v1/import/products
\`\`\``,
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
                description:
                  "Excel file containing products, stock, and pricing",
              },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      202: {
        description: "Import job started (file validated successfully)",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  jobId: z.number(),
                  totalRows: z.number(),
                  statusUrl: z.string(),
                }),
              }),
            ),
          },
        },
      },
      400: {
        description:
          "Invalid file or validation error (returned immediately before job starts)",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  async (c) => {
    const user = c.get("user");

    // Extract and validate file
    const uploadedFile = await extractFileFromFormData(c);
    validateFile(uploadedFile);

    // Get file buffer
    const fileBuffer = await getFileBuffer(uploadedFile);

    // Pre-validate file structure (synchronous check before starting background job)
    // This catches errors immediately: invalid format, wrong headers, empty file, etc.
    const validation = await preValidateProductsFile(fileBuffer);

    // Upload file to Azure (non-blocking, continues even if upload fails)
    const fileUrl = await uploadAndSaveImportFile(
      fileBuffer,
      uploadedFile.name,
      "PARTS"
    );

    // Create import log entry with known totalRows
    const importLog = await prisma.importLog.create({
      data: {
        type: "PARTS",
        fileName: uploadedFile.name,
        fileSize: uploadedFile.size,
        fileUrl: fileUrl || undefined,
        totalRows: validation.totalRows,
        importedBy: user.id,
      },
    });

    // Create job in job manager with known total
    jobManager.createJob(importLog.id, validation.totalRows);

    // Start background processing (don't await)
    importProducts(
      fileBuffer,
      uploadedFile.name,
      uploadedFile.size,
      user.id,
      (current) => {
        // Update job progress
        jobManager.updateProgress(importLog.id, current);
      },
      importLog.id, // Pass the import log ID to reuse
    )
      .then(() => {
        // Mark job as complete
        jobManager.completeJob(importLog.id);

        // Auto-sync to TypeSense after successful import
        console.log(
          `[Product Import] Import ${importLog.id} completed successfully. Starting TypeSense sync...`,
        );

        syncProductsToTypesense((progress) => {
          console.log(
            `[Auto-Sync] ${progress.stage}: ${progress.message} (${progress.productsProcessed}/${progress.totalProducts})`,
          );
        })
          .then((result) => {
            if (result.success) {
              console.log(
                `[Auto-Sync] TypeSense sync completed: ${result.totalProducts} products in ${(result.durationMs / 1000 / 60).toFixed(2)} minutes`,
              );
            } else {
              console.error(
                `[Auto-Sync] TypeSense sync failed: ${result.error}`,
              );
            }
          })
          .catch((syncError) => {
            console.error("[Auto-Sync] TypeSense sync error:", syncError);
          });
      })
      .catch((error) => {
        // Mark job as failed
        jobManager.failJob(
          importLog.id,
          error instanceof Error ? error.message : "Unknown error",
        );

        // Update import log
        prisma.importLog
          .update({
            where: { id: importLog.id },
            data: {
              importStatus: ImportStatus.FAILED,
              completedAt: new Date(),
              errorCount: 1,
            },
          })
          .catch(console.error);
      });

    // Return immediately with job ID
    return c.json(
      {
        success: true,
        message: "Product import started in background",
        data: {
          jobId: importLog.id,
          totalRows: validation.totalRows,
          statusUrl: `/api/v1/import/status/${importLog.id}`,
        },
      },
      202,
    );
  },
);

// Import Superseded Mappings
importRoutes.post(
  "/superseded",
  describeRoute({
    tags: ["Import"],
    summary: "Import superseded part mappings",
    description: `Upload an Excel file (XLSX, XLS, or CSV) to import superseded part mappings. Supports files up to 100MB.

**How It Works:**
- Archives old mappings not in the file (sets status=false)
- Creates new mappings or reactivates existing ones (sets status=true)
- Maintains complete history of mapping changes
- **Automatically updates TypeSense** (incremental, only affected products)

**TypeSense Sync:**
- Only updates affected products (fast: ~5-20 seconds)
- Updates supersededBy field in search index
- Much faster than full sync

**File Format:**
- File should contain FROMPARTNO and TOPARTNO columns
- FROMPARTNO = productCode (the old/superseded part)
- TOPARTNO = supersededBy (the new/replacement part)

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead:

\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/superseded.xlsx" \\
  http://localhost:3000/api/v1/import/superseded
\`\`\``,
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
                description: "Excel file containing superseded part mappings",
              },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      200: {
        description: "Import completed with results",
        content: {
          "application/json": {
            schema: resolver(importResultSchema),
          },
        },
      },
      400: {
        description: "Invalid file or validation error",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  async (c) => {
    const user = c.get("user");

    // Extract and validate file
    const uploadedFile = await extractFileFromFormData(c);
    validateFile(uploadedFile);

    // Get file buffer
    const fileBuffer = await getFileBuffer(uploadedFile);

    // Pre-validate file structure (synchronous check)
    await preValidateSupersededFile(fileBuffer);

    // Upload file to Azure (non-blocking, continues even if upload fails)
    const fileUrl = await uploadAndSaveImportFile(
      fileBuffer,
      uploadedFile.name,
      "SUPERSEDED"
    );

    // Import superseded mappings (all validation passed, proceed with import)
    const result = await importSuperseded(
      fileBuffer,
      uploadedFile.name,
      uploadedFile.size,
      user.id,
      fileUrl,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Import Backorders
importRoutes.post(
  "/backorders",
  describeRoute({
    tags: ["Import"],
    summary: "Import backorder updates",
    description: `Upload an Excel file (XLSX, XLS, or CSV) to import backorder updates. Supports files up to 100MB.

**How It Works:**
- Matches orders by "Your Order No" with Order.orderNumber
- Matches order items by "Part" with OrderItem.productCode
- Archives old backorder logs (sets status=false)
- Creates new backorder log entries
- Updates OrderItem with qtyOrdered, qtyOutstanding, inWarehouse

**File Format:**
- Required columns: Account No, Customer Name, Your Order No, Our Order No, Itm, Part, Description, Q Ord, Q/O, In WH, Currency, Unit Price, Total
- Your Order No = Order number in the system
- Part = Product code
- Q Ord = Quantity ordered
- Q/O = Quantity withheld
- In WH = Quantity available

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead:

\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/backorders.xlsx" \\
  http://localhost:3000/api/v1/import/backorders
\`\`\``,
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
                description: "Excel file containing backorder updates",
              },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      200: {
        description: "Import completed with results",
        content: {
          "application/json": {
            schema: resolver(importResultSchema),
          },
        },
      },
      400: {
        description: "Invalid file or validation error",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  async (c) => {
    const user = c.get("user");

    // Extract and validate file
    const uploadedFile = await extractFileFromFormData(c);
    validateFile(uploadedFile);

    // Get file buffer
    const fileBuffer = await getFileBuffer(uploadedFile);

    // Pre-validate file structure (synchronous check)
    await preValidateBackOrderFile(fileBuffer);

    // Upload file to Azure (non-blocking, continues even if upload fails)
    const fileUrl = await uploadAndSaveImportFile(
      fileBuffer,
      uploadedFile.name,
      "BACKORDER"
    );

    // Import backorders (all validation passed, proceed with import)
    const result = await importBackOrders(
      fileBuffer,
      uploadedFile.name,
      uploadedFile.size,
      user.id,
      fileUrl,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Import Order Status
importRoutes.post(
  "/order-status",
  describeRoute({
    tags: ["Import"],
    summary: "Import order status updates",
    description: `Upload an Excel file (XLSX, XLS, or CSV) to import order status updates. Supports files up to 100MB.

**How It Works:**
- Matches orders by "Your Order No" with Order.orderNumber
- Maps Excel status values to system OrderStatus enum (case-insensitive)
- Archives old status logs (sets status=false in OrderStatusLog)
- Creates new status log entries
- Updates Order with new status and K8 order number
- Creates entry in OrderStatusHistory for audit trail

**Status Mapping (case-insensitive):**
- "Backorder" → BACKORDER
- "Ready for Shipment" / "Ready_For_Shipment" → READY_FOR_SHIPMENT
- "Fullfilled" / "Fulfilled" → FULLFILLED
- "Cancelled" / "Canceled" → CANCELLED
- "Processing" → PROCESSING
- "Created" → CREATED

**File Format:**
- Required columns: Your Order No, Our Order No, Status
- Your Order No = Order number in the system
- Our Order No = K8 order number (stored in k8OrderNo field)
- Status = New status (case-insensitive, mapped to enum)

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead:

\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/order-status.xlsx" \\
  http://localhost:3000/api/v1/import/order-status
\`\`\``,
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
                description: "Excel file containing order status updates",
              },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      200: {
        description: "Import completed with results",
        content: {
          "application/json": {
            schema: resolver(importResultSchema),
          },
        },
      },
      400: {
        description: "Invalid file or validation error",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  async (c) => {
    const user = c.get("user");

    // Extract and validate file
    const uploadedFile = await extractFileFromFormData(c);
    validateFile(uploadedFile);

    // Get file buffer
    const fileBuffer = await getFileBuffer(uploadedFile);

    // Pre-validate file structure (synchronous check)
    await preValidateOrderStatusFile(fileBuffer);

    // Upload file to Azure (non-blocking, continues even if upload fails)
    const fileUrl = await uploadAndSaveImportFile(
      fileBuffer,
      uploadedFile.name,
      "ORDER_STATUS"
    );

    // Import order status (all validation passed, proceed with import)
    const result = await importOrderStatus(
      fileBuffer,
      uploadedFile.name,
      uploadedFile.size,
      user.id,
      fileUrl,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Get Import Template by Type
importRoutes.post(
  "/template",
  authenticate,
  describeRoute({
    tags: ["Import"],
    summary: "Download Excel template file by import type",
    description: `Download the Excel template file for a specific import type. The template includes the required column headers and format.

**Supported Types:**
- \`dealer\` - Returns Dealer_Model_Template.xlsx
- \`product\` - Returns Product_Model_Template.xlsx
- \`superseded\` - Returns SuperSeded_Model_Template.xlsx
- \`overallStatus\` - Returns OverallStatus_Model_Template.xlsx
- \`Backlog\` - Returns Backlog_Model_Template.xlsx

**Request Body:**
\`\`\`json
{
  "type": "dealer"
}
\`\`\`

**Examples:**

Get dealer template:
\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"dealer"}' \\
  http://localhost:3000/api/v1/import/template \\
  --output dealer_template.xlsx
\`\`\`

Get product template:
\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"product"}' \\
  http://localhost:3000/api/v1/import/template \\
  --output product_template.xlsx
\`\`\`

Get superseded template:
\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"superseded"}' \\
  http://localhost:3000/api/v1/import/template \\
  --output superseded_template.xlsx
\`\`\``,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "dealer",
                  "product",
                  "superseded",
                  "overallStatus",
                  "Backlog",
                ],
                description: "Import type to get template for",
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: "Excel template file",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
      400: {
        description: "Invalid type or missing type in request body",
      },
      401: {
        description: "Authentication required",
      },
      404: {
        description: "Template file not found",
      },
    },
  }),
  zValidator("json", getTemplateSchema),
  async (c) => {
    const { type } = c.req.valid("json");

    // Map type to template file name
    const templateMap: Record<string, string> = {
      dealer: "Dealer_Model_Template.xlsx",
      product: "Product_Model_Template.xlsx",
      superseded: "SuperSeded_Model_Template.xlsx",
      overallStatus: "OverallStatus_Model_Template.xlsx",
      Backlog: "Backlog_Model_Template.xlsx",
    };

    const fileName = templateMap[type];
    if (!fileName) {
      throw new HTTPException(400, {
        message: `Invalid type: ${type}. Must be one of: dealer, product, superseded, overallStatus, Backlog`,
      });
    }

    // Get the template file path
    const templatePath = join(
      process.cwd(),
      "src",
      "templates",
      "excel",
      fileName,
    );

    // Check if file exists
    try {
      const file = Bun.file(templatePath);
      const exists = await file.exists();

      if (!exists) {
        throw new HTTPException(404, {
          message: `Template file not found: ${fileName}`,
        });
      }

      // Read file as buffer
      const fileBuffer = await file.arrayBuffer();

      // Set headers for file download
      c.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      c.header("Content-Disposition", `attachment; filename="${fileName}"`);
      c.header("Content-Length", fileBuffer.byteLength.toString());

      // Return file
      return c.body(new Uint8Array(fileBuffer));
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: `Failed to read template file: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
);

// Get Import Error logs by Import ID
importRoutes.get(
  "/:importId/errors",
  authenticate,
  describeRoute({
    tags: ["Import"],
    summary: "Get import error logs by import ID with pagination",
    description: `Get paginated list of error logs for a specific import. Each error log contains the row number, row data, and validation errors.

**Features:**
- Filter by import ID (path parameter)
- Pagination with accurate counts
- Sorted by row number (ascending)
- Returns row data and error messages for each failed row

**Path Parameters:**
- importId: The ID of the import log

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)

**Examples:**

Get first page of errors:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import/1/errors?page=1&limit=20"
\`\`\`

Get errors with custom pagination:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import/1/errors?page=2&limit=50"
\`\`\``,
    responses: {
      200: {
        description: "Paginated list of import error logs",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    rowNumber: z.number(),
                    rowData: z.any(),
                    errors: z.array(z.string()),
                    createdAt: z.date(),
                    updatedAt: z.date(),
                  }),
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              }),
            ),
          },
        },
      },
      401: {
        description: "Authentication required",
      },
      404: {
        description: "Import log not found",
      },
    },
  }),
  zValidator("query", getImportErrorsQuerySchema),
  async (c) => {
    const importId = parseInt(c.req.param("importId"));
    const query = c.req.valid("query");

    if (isNaN(importId)) {
      throw new HTTPException(400, { message: "Invalid import ID" });
    }

    const { errors, total } = await getImportErrors(importId, query);

    return c.json({
      success: true,
      data: errors,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  },
);

// Export Import Error logs by Import ID
importRoutes.get(
  "/:importId/errors/export",
  authenticate,
  describeRoute({
    tags: ["Import"],
    summary: "Export import error logs to Excel by import ID",
    description: `Export all import error logs to Excel file for a specific import. Exports all errors without pagination.

**Features:**
- Filter by import ID (path parameter)
- Exports all error logs (no pagination)
- Exports row number, errors, row data, and created timestamp
- Returns Excel file (.xlsx) for download
- Sorted by row number (ascending)

**Path Parameters:**
- importId: The ID of the import log

**Example:**

Export all errors:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import/1/errors/export" \\
  --output import_errors.xlsx
\`\`\``,
    responses: {
      200: {
        description: "Excel file with import error logs",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
      401: {
        description: "Authentication required",
      },
      404: {
        description: "Import log not found",
      },
    },
  }),
  async (c) => {
    const importId = parseInt(c.req.param("importId"));

    if (isNaN(importId)) {
      throw new HTTPException(400, { message: "Invalid import ID" });
    }

    // Export errors to Excel
    const excelBuffer = await exportImportErrorsToExcel(importId);

    // Get import log info for filename
    const importLog = await prisma.importLog.findUnique({
      where: { id: importId },
      select: { fileName: true, type: true },
    });

    // Generate filename with timestamp and import info
    const timestamp = new Date().toISOString().split("T")[0];
    const importType = importLog?.type || "import";
    const filename = `import_errors_${importType}_${importId}_${timestamp}.xlsx`;

    // Set headers for file download
    c.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Content-Length", excelBuffer.length.toString());

    // Return Excel file (convert Buffer to Uint8Array for Hono)
    return c.body(new Uint8Array(excelBuffer));
  },
);

// Get totalRows, successCount, errorCount for an Import ID
importRoutes.get(
  "/:importId/stats",
  authenticate,
  describeRoute({
    tags: ["Import"],
    summary: "Get import statistics by import ID",
    description: `Get summary statistics (totalRows, successCount, errorCount) for a specific import.

**Returns:**
- totalRows: Total number of rows in the import file
- successCount: Number of successfully imported rows
- errorCount: Number of rows with errors

**Path Parameters:**
- importId: The ID of the import log

**Example:**

Get statistics for import ID 1:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/import/1/stats"
\`\`\``,
    responses: {
      200: {
        description: "Import statistics",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  totalRows: z.number(),
                  successCount: z.number(),
                  errorCount: z.number(),
                }),
              }),
            ),
          },
        },
      },
      401: {
        description: "Authentication required",
      },
      404: {
        description: "Import log not found",
      },
    },
  }),
  async (c) => {
    const importId = parseInt(c.req.param("importId"));

    if (isNaN(importId)) {
      throw new HTTPException(400, { message: "Invalid import ID" });
    }

    const stats = await getImportStats(importId);

    return c.json({
      success: true,
      data: stats,
    });
  },
);

export default importRoutes;
