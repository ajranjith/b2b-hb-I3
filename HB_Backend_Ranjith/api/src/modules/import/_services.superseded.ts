import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { ImportType, ImportStatus } from 'generated/prisma';
import { HTTPException } from 'hono/http-exception';
import {
  extractCellValue,
  validateHeaders,
  extractHeaders,
  createColumnIndexMap,
  loadWorkbook,
} from '@/utils/importHelpers';
import { syncSupersededToTypesense } from '@/services/typesenseSync.superseded';

interface SupersededImportRow {
  fromPartNo: string;
  toPartNo: string;
}

interface ImportError {
  row: number;
  data: any;
  errors: string[];
}

interface ImportResult {
  importLogId: number;
  totalRows: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  errors: ImportError[];
}

const REQUIRED_HEADERS = ['FROMPARTNO', 'TOPARTNO'];
const OPTIONAL_HEADERS: string[] = [];

function validateRow(row: SupersededImportRow): string[] {
  const errors: string[] = [];

  // Validate fromPartNo
  if (!row.fromPartNo || typeof row.fromPartNo !== 'string' || row.fromPartNo.trim() === '') {
    errors.push('FROMPARTNO is required');
  }

  // Validate toPartNo
  if (!row.toPartNo || typeof row.toPartNo !== 'string' || row.toPartNo.trim() === '') {
    errors.push('TOPARTNO is required');
  }

  // Validate that fromPartNo and toPartNo are not the same
  if (row.fromPartNo && row.toPartNo &&
      row.fromPartNo.toUpperCase().trim() === row.toPartNo.toUpperCase().trim()) {
    errors.push('FROMPARTNO and TOPARTNO cannot be the same');
  }

  return errors;
}

export async function importSuperseded(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number,
  userId?: number,
  fileUrl?: string | null
): Promise<ImportResult> {
  const startTime = Date.now();

  // Load workbook (supports both Excel and CSV)
  const workbook = await loadWorkbook(fileBuffer, fileName);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new HTTPException(400, { message: 'No worksheet found in the file' });
  }

  // Extract and validate headers
  const headers = extractHeaders(worksheet);
  validateHeaders(headers, REQUIRED_HEADERS, OPTIONAL_HEADERS);

  // Get column indices
  const columnIndices = createColumnIndexMap(headers);

  const errors: ImportError[] = [];
  const totalRows = worksheet.rowCount - 1; // Exclude header row

  // Create import log
  const importLog = await prisma.importLog.create({
    data: {
      type: ImportType.SUPERSEDED,
      fileName,
      fileSize,
      fileUrl: fileUrl || undefined,
      totalRows,
      importedBy: userId,
    },
  });

  // Extract and validate all rows
  const validRows: Array<{ rowNumber: number; data: SupersededImportRow }> = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Skip empty rows
    if (row.cellCount === 0) {
      continue;
    }

    // Extract row data
    const fromPartNoValue = extractCellValue(row.getCell(columnIndices['FROMPARTNO'] + 1));
    const toPartNoValue = extractCellValue(row.getCell(columnIndices['TOPARTNO'] + 1));

    const rowData: SupersededImportRow = {
      fromPartNo: fromPartNoValue != null ? String(fromPartNoValue) : '',
      toPartNo: toPartNoValue != null ? String(toPartNoValue) : '',
    };

    // Validate row
    const validationErrors = validateRow(rowData);

    if (validationErrors.length > 0) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: validationErrors,
      });
      continue;
    }

    validRows.push({ rowNumber, data: rowData });
  }

  if (validRows.length === 0) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Log errors to database
    if (errors.length > 0) {
      await prisma.importErrorsLog.createMany({
        data: errors.map((error) => ({
          importLogId: importLog.id,
          rowNumber: error.row,
          rowData: error.data,
          errors: error.errors,
        })),
      });
    }

    // Update import log
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: {
        importStatus: ImportStatus.COMPLETED,
        successCount: 0,
        errorCount: errors.length,
        completedAt: new Date(),
        durationMs,
      },
    });

    return {
      importLogId: importLog.id,
      totalRows,
      successCount: 0,
      errorCount: errors.length,
      durationMs,
      errors,
    };
  }

  // Update status to PROCESSING
  await prisma.importLog.update({
    where: { id: importLog.id },
    data: { importStatus: ImportStatus.PROCESSING },
  });

  let successCount = 0;
  const affectedProductCodes = new Set<string>(); // Track products that need TypeSense update

  // Process all mappings with upsert mechanism
  // Strategy: Archive old mappings (status=false), create/reactivate new ones
  // This maintains history similar to product prices/stocks
  try {
    await prisma.$transaction(async (tx) => {
      // Step 1: Get all existing active mappings
      const existingMappings = await tx.productSupersededMapping.findMany({
        where: { status: true },
        select: {
          productCode: true,
          supersededBy: true,
        },
      });

      // Step 2: Create a set of new mappings from import file
      const newMappingsSet = new Set(
        validRows.map(
          ({ data }) =>
            `${data.fromPartNo.toUpperCase().trim()}:${data.toPartNo.toUpperCase().trim()}`
        )
      );

      // Step 3: Find mappings that should be archived (exist in DB but not in file)
      const mappingsToArchive = existingMappings.filter(
        (mapping) => !newMappingsSet.has(`${mapping.productCode}:${mapping.supersededBy}`)
      );

      // Track archived products (they need TypeSense update)
      mappingsToArchive.forEach((mapping) => affectedProductCodes.add(mapping.productCode));

      // Step 4: Archive old mappings (set status=false)
      if (mappingsToArchive.length > 0) {
        await tx.productSupersededMapping.updateMany({
          where: {
            OR: mappingsToArchive.map((m) => ({
              productCode: m.productCode,
              supersededBy: m.supersededBy,
            })),
            status: true,
          },
          data: { status: false },
        });
        console.log(`[Superseded Import] Archived ${mappingsToArchive.length} old mappings`);
      }

      // Step 5: Process new mappings (upsert)
      for (const { data } of validRows) {
        const productCode = data.fromPartNo.toUpperCase().trim();
        const supersededBy = data.toPartNo.toUpperCase().trim();

        // Track this product (needs TypeSense update)
        affectedProductCodes.add(productCode);

        // Check if mapping exists (active or inactive)
        const existingMapping = await tx.productSupersededMapping.findUnique({
          where: {
            productCode_supersededBy: {
              productCode,
              supersededBy,
            },
          },
        });

        if (existingMapping) {
          // Mapping exists - reactivate if inactive
          if (!existingMapping.status) {
            await tx.productSupersededMapping.update({
              where: {
                productCode_supersededBy: {
                  productCode,
                  supersededBy,
                },
              },
              data: { status: true },
            });
          }
          // If already active, no action needed
        } else {
          // Mapping doesn't exist - create new
          await tx.productSupersededMapping.create({
            data: {
              productCode,
              supersededBy,
              status: true,
            },
          });
        }
      }
    });

    successCount = validRows.length;
  } catch (error) {
    console.error('[Superseded Import] Bulk processing failed, trying individual operations:', error);

    // If bulk operation fails, try individual operations
    for (const { rowNumber, data } of validRows) {
      try {
        const productCode = data.fromPartNo.toUpperCase().trim();
        const supersededBy = data.toPartNo.toUpperCase().trim();

        // Track this product (needs TypeSense update)
        affectedProductCodes.add(productCode);

        // Archive old mapping if exists
        await prisma.productSupersededMapping.updateMany({
          where: {
            productCode,
            status: true,
          },
          data: { status: false },
        });

        // Upsert new mapping
        await prisma.productSupersededMapping.upsert({
          where: {
            productCode_supersededBy: {
              productCode,
              supersededBy,
            },
          },
          create: {
            productCode,
            supersededBy,
            status: true,
          },
          update: {
            status: true, // Reactivate if was inactive
          },
        });

        successCount++;
      } catch (individualError) {
        errors.push({
          row: rowNumber,
          data,
          errors: [individualError instanceof Error ? individualError.message : 'Failed to import mapping'],
        });
      }
    }
  }

  const endTime = Date.now();
  const durationMs = endTime - startTime;

  // Log errors to database
  if (errors.length > 0) {
    await prisma.importErrorsLog.createMany({
      data: errors.map((error) => ({
        importLogId: importLog.id,
        rowNumber: error.row,
        rowData: error.data,
        errors: error.errors,
      })),
    });
  }

  // Update import log with final results
  await prisma.importLog.update({
    where: { id: importLog.id },
    data: {
      importStatus: ImportStatus.COMPLETED,
      successCount,
      errorCount: errors.length,
      completedAt: new Date(),
      durationMs,
    },
  });

  // Trigger incremental TypeSense sync for affected products
  if (affectedProductCodes.size > 0) {
    console.log(
      `[Superseded Import] Import completed. Syncing ${affectedProductCodes.size} affected products to TypeSense...`
    );

    // Run sync asynchronously (don't block the response)
    syncSupersededToTypesense(affectedProductCodes)
      .then((result) => {
        if (result.success) {
          console.log(
            `[Superseded Import] TypeSense sync completed: ${result.affectedProducts} products updated in ${(result.durationMs / 1000).toFixed(2)}s`
          );
        } else {
          console.error(`[Superseded Import] TypeSense sync failed: ${result.error}`);
        }
      })
      .catch((error) => {
        console.error('[Superseded Import] TypeSense sync error:', error);
      });
  } else {
    console.log('[Superseded Import] No products affected, skipping TypeSense sync');
  }

  return {
    importLogId: importLog.id,
    totalRows,
    successCount,
    errorCount: errors.length,
    durationMs,
    errors,
  };
}
