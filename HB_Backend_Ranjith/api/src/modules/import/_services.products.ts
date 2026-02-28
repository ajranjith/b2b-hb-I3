import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { ProductType, ImportType, ImportStatus } from 'generated/prisma';
import { HTTPException } from 'hono/http-exception';
import {
  extractCellValue,
  validateHeaders,
  extractHeaders,
  createColumnIndexMap,
  loadWorkbook,
} from '@/utils/importHelpers';

interface ProductImportRow {
  supplierCode: string;
  productCode: string;
  height: number;
  length: number;
  width: number;
  weight: number;
  description: string;
  stock: number;
  costPrice: number;
  retailPrice: number;
  tradePrice: number;
  band1: number;
  band2: number;
  band3: number;
  band4: number;
  listPrice: number;
  discountCode: string;
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

const REQUIRED_HEADERS = [
  'Supplier',
  'Product Code',
  'Height',
  'Length',
  'Width',
  'Weight',
  'Full Description',
  'Free Stock',
  'Cost Price',
  'Retail Price',
  'Trade Price',
  'Band 1',
  'Band 2',
  'Band 3',
  'Band 4',
  'List Price',
  'Discount Code'
];

const OPTIONAL_HEADERS:string[] = [];

/**
 * Normalize product type string to proper enum value
 * Handles case-insensitive matching to prevent casing issues
 */
function normalizeProductType(typeString: string): ProductType {
  const upperType = String(typeString || '').toUpperCase().trim();

  switch (upperType) {
    case 'GENUINE':
      return ProductType.Genuine;
    case 'AFTERMARKET':
      return ProductType.Aftermarket;
    case 'BRANDED':
      return ProductType.Branded;
    default:
      return ProductType.Aftermarket;
  }
}

function determineProductType(discountCode: string): ProductType {
  const lowerDiscountCode = String(discountCode || '').toLowerCase().trim();

  // Map discount code to product type
  if (lowerDiscountCode === 'gn') {
    return ProductType.Genuine;
  }
  if (lowerDiscountCode === 'es') {
    return ProductType.Aftermarket;
  }
  if (lowerDiscountCode === 'br') {
    return ProductType.Branded;
  }

  // Default to Aftermarket if code is unknown
  return ProductType.Aftermarket;
}

function validateRow(row: ProductImportRow): string[] {
  const errors: string[] = [];

  // Validate product code
  const productCode = String(row.productCode || '').trim();
  if (!productCode) {
    errors.push('Product Code is required');
  }

  // Validate description
  const description = String(row.description || '').trim();
  if (!description) {
    errors.push('Full Description is required');
  }

  // Validate discount code
  const discountCode = String(row.discountCode || '').trim();
  if (!discountCode) {
    errors.push('Discount Code is required');
  } else {
    const validCodes = ['gn', 'es', 'br'];
    const lowerCode = discountCode.toLowerCase();
    if (!validCodes.includes(lowerCode)) {
      errors.push('Discount Code must be one of: gn (Genuine), es (Aftermarket), br (Branded)');
    }
  }

  // Validate stock (can be negative)
  if (typeof row.stock !== 'number' || isNaN(row.stock)) {
    errors.push('Free Stock must be a valid number');
  }

  // Validate dimensions (optional, but must be valid numbers if provided)
  const dimensionFields = ['height', 'length', 'width', 'weight'];
  for (const field of dimensionFields) {
    const value = row[field as keyof ProductImportRow];
    if (value !== null && value !== undefined && value !== '' && (typeof value !== 'number' || isNaN(value) || value < 0)) {
      errors.push(`${field.charAt(0).toUpperCase() + field.slice(1)} must be a non-negative number`);
    }
  }

  // Validate prices (can be decimals)
  const priceFields = ['retailPrice', 'tradePrice', 'band1', 'band2', 'band3', 'band4', 'listPrice'];
  for (const field of priceFields) {
    const value = row[field as keyof ProductImportRow];
    if (typeof value !== 'number' || isNaN(value) || value < 0) {
      errors.push(`${field.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())} must be a non-negative number`);
    }
  }

  return errors;
}

interface ProgressCallback {
  (current: number, total: number): void;
}

export async function importProducts(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number,
  userId?: number,
  onProgress?: ProgressCallback,
  importLogId?: number
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

  // Create or update import log
  let importLog;
  if (importLogId) {
    // Update existing import log with totalRows
    importLog = await prisma.importLog.update({
      where: { id: importLogId },
      data: { totalRows },
    });
  } else {
    // Create new import log
    importLog = await prisma.importLog.create({
      data: {
        type: ImportType.PARTS,
        fileName,
        fileSize,
        totalRows,
        importedBy: userId,
      },
    });
  }

  // Extract and validate all rows
  const validUniqueRows: Array<{ rowNumber: number; data: ProductImportRow; productType: ProductType }> = [];
  const productCodeMap = new Map<string, number>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Skip empty rows
    if (row.cellCount === 0) {
      continue;
    }

    // Extract row data
    const rowData: ProductImportRow = {
      supplierCode: String(extractCellValue(row.getCell(columnIndices['Supplier'] + 1)) || ''),
      productCode: String(extractCellValue(row.getCell(columnIndices['Product Code'] + 1)) || ''),
      height: extractCellValue(row.getCell(columnIndices['Height'] + 1)) || 0,
      length: extractCellValue(row.getCell(columnIndices['Length'] + 1)) || 0,
      width: extractCellValue(row.getCell(columnIndices['Width'] + 1)) || 0,
      weight: extractCellValue(row.getCell(columnIndices['Weight'] + 1)) || 0,
      description: String(extractCellValue(row.getCell(columnIndices['Full Description'] + 1)) || ''),
      stock: extractCellValue(row.getCell(columnIndices['Free Stock'] + 1)),
      costPrice: extractCellValue(row.getCell(columnIndices['Cost Price'] + 1)) || 0, // Ignored, but extracted for validation
      retailPrice: extractCellValue(row.getCell(columnIndices['Retail Price'] + 1)) || 0, // Maps to Net1
      tradePrice: extractCellValue(row.getCell(columnIndices['Trade Price'] + 1)) || 0, // Maps to Net2
      band1: extractCellValue(row.getCell(columnIndices['Band 1'] + 1)) || 0, // Maps to Net3
      band2: extractCellValue(row.getCell(columnIndices['Band 2'] + 1)) || 0, // Maps to Net4
      band3: extractCellValue(row.getCell(columnIndices['Band 3'] + 1)) || 0, // Maps to Net5
      band4: extractCellValue(row.getCell(columnIndices['Band 4'] + 1)) || 0, // Maps to Net6
      listPrice: extractCellValue(row.getCell(columnIndices['List Price'] + 1)) || 0, // Maps to Net7
      discountCode: String(extractCellValue(row.getCell(columnIndices['Discount Code'] + 1)) || ''),
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

    // Check for duplicate product codes within the file
    const productCode = rowData.productCode.toUpperCase().trim();
    if (productCodeMap.has(productCode)) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [`Duplicate product code in file (first occurrence at row ${productCodeMap.get(productCode)})`],
      });
      continue;
    }

    // Determine product type for this row based on discount code
    const productType = determineProductType(rowData.discountCode);

    productCodeMap.set(productCode, rowNumber);
    validUniqueRows.push({ rowNumber, data: rowData, productType });
  }

  if (validUniqueRows.length === 0) {
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
  const BATCH_SIZE = 10000; // Optimal batch size: balances performance with transaction safety

  // Process products in batches for better performance
  for (let i = 0; i < validUniqueRows.length; i += BATCH_SIZE) {
    const batch = validUniqueRows.slice(i, i + BATCH_SIZE);

    try {
      // Process entire batch in a single transaction
      await prisma.$transaction(async (tx) => {
        // Step 1: Get all product codes in this batch
        const productCodes = batch.map(({ data }) => data.productCode.toUpperCase().trim());

        // Step 2: Find existing products
        const existingProducts = await tx.product.findMany({
          where: { code: { in: productCodes } },
        });

        const existingProductMap = new Map(existingProducts.map((p) => [p.code, p]));

        // Step 3: Separate into creates and updates
        const productsToCreate = [];
        const productsToUpdate = [];

        for (const { data, productType } of batch) {
          const productCode = data.productCode.toUpperCase().trim();
          const existingProduct = existingProductMap.get(productCode);

          if (existingProduct) {
            productsToUpdate.push({
              id: existingProduct.id,
              name: data.description.trim(),
              type: productType,
              supplierCode: data.supplierCode.trim() || null,
              height: data.height || null,
              length: data.length || null,
              width: data.width || null,
              weight: data.weight || null,
            });
          } else {
            productsToCreate.push({
              code: productCode,
              name: data.description.trim(),
              type: productType,
              supplierCode: data.supplierCode.trim() || null,
              height: data.height || null,
              length: data.length || null,
              width: data.width || null,
              weight: data.weight || null,
            });
          }
        }

        // Step 4: Bulk create new products
        if (productsToCreate.length > 0) {
          await tx.product.createMany({
            data: productsToCreate,
          });
        }

        // Step 5: Update existing products (no bulk update available with different values)
        for (const product of productsToUpdate) {
          await tx.product.update({
            where: { id: product.id },
            data: {
              name: product.name,
              type: product.type,
              supplierCode: product.supplierCode,
              height: product.height,
              length: product.length,
              width: product.width,
              weight: product.weight,
            },
          });
        }

        // Step 6: Get all products again (including newly created ones)
        const allProducts = await tx.product.findMany({
          where: { code: { in: productCodes } },
        });

        const productMap = new Map(allProducts.map((p) => [p.code, p]));

        // Step 7: Archive old stock records (bulk operation)
        const productIds = allProducts.map((p) => p.id);
        await tx.productStock.updateMany({
          where: {
            productId: { in: productIds },
            status: true,
          },
          data: { status: false },
        });

        // Step 8: Create new stock records (bulk operation)
        const stockRecords = batch.map(({ data }) => {
          const productCode = data.productCode.toUpperCase().trim();
          const product = productMap.get(productCode)!;
          return {
            productId: product.id,
            stock: Math.round(data.stock), // Round to integer, can be negative
          };
        });

        await tx.productStock.createMany({
          data: stockRecords,
        });

        // Step 9: Archive old price records (bulk operation)
        await tx.productPrice.updateMany({
          where: {
            productId: { in: productIds },
            status: true,
          },
          data: { status: false },
        });

        // Step 10: Create new price records (bulk operation)
        // Mapping: Retail Price -> Net1, Trade Price -> Net2, Band 1 -> Net3, Band 2 -> Net4, Band 3 -> Net5, Band 4 -> Net6, List Price -> Net7
        const priceRecords = batch.map(({ data }) => {
          const productCode = data.productCode.toUpperCase().trim();
          const product = productMap.get(productCode)!;
          return {
            productId: product.id,
            currency: 'GBP',
            net1: data.retailPrice,
            net2: data.tradePrice,
            net3: data.band1,
            net4: data.band2,
            net5: data.band3,
            net6: data.band4,
            net7: data.listPrice,
          };
        });

        await tx.productPrice.createMany({
          data: priceRecords,
        });
      });

      // Update success count for the entire batch
      successCount += batch.length;

      // Report progress after batch completion
      if (onProgress) {
        onProgress(successCount, validUniqueRows.length);
      }
    } catch (error) {
      // If batch processing fails, fall back to individual processing for this batch
      for (const { rowNumber, data, productType } of batch) {
        try {
          const productCode = data.productCode.toUpperCase().trim();

          await prisma.$transaction(async (tx) => {
            // Upsert product
            const product = await tx.product.upsert({
              where: { code: productCode },
              create: {
                code: productCode,
                name: data.description.trim(),
                type: productType,
                supplierCode: data.supplierCode.trim() || null,
                height: data.height || null,
                length: data.length || null,
                width: data.width || null,
                weight: data.weight || null,
              },
              update: {
                name: data.description.trim(),
                type: productType,
                supplierCode: data.supplierCode.trim() || null,
                height: data.height || null,
                length: data.length || null,
                width: data.width || null,
                weight: data.weight || null,
              },
            });

            // Archive old stock records
            await tx.productStock.updateMany({
              where: {
                productId: product.id,
                status: true,
              },
              data: {
                status: false,
              },
            });

            // Create new stock record
            await tx.productStock.create({
              data: {
                productId: product.id,
                stock: Math.round(data.stock), // Round to integer, can be negative
              },
            });

            // Archive old price records
            await tx.productPrice.updateMany({
              where: {
                productId: product.id,
                status: true,
              },
              data: {
                status: false,
              },
            });

            // Create new price record
            // Mapping: Retail Price -> Net1, Trade Price -> Net2, Band 1 -> Net3, Band 2 -> Net4, Band 3 -> Net5, Band 4 -> Net6, List Price -> Net7
            await tx.productPrice.create({
              data: {
                productId: product.id,
                currency: 'GBP',
                net1: data.retailPrice,
                net2: data.tradePrice,
                net3: data.band1,
                net4: data.band2,
                net5: data.band3,
                net6: data.band4,
                net7: data.listPrice,
              },
            });
          });

          successCount++;

          // Report progress after each successful product
          if (onProgress) {
            onProgress(successCount, validUniqueRows.length);
          }
        } catch (individualError) {
          errors.push({
            row: rowNumber,
            data,
            errors: [individualError instanceof Error ? individualError.message : 'Failed to import product'],
          });
        }
      }
    }

    // Update import log after each batch
    if (importLog.id) {
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          successCount,
          errorCount: errors.length,
        },
      });
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

  return {
    importLogId: importLog.id,
    totalRows,
    successCount,
    errorCount: errors.length,
    durationMs,
    errors,
  };
}

function ss () {
  
}