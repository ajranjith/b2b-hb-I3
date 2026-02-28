import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { ImportType, ImportStatus } from 'generated/prisma';
import { HTTPException } from 'hono/http-exception';
import { extractCellValue, extractHeaders, validateHeaders, createColumnIndexMap, loadWorkbook } from '@/utils/importHelpers';

interface BackOrderImportRow {
  accountNo: number;
  customerName: string;
  yourOrderNo: string;
  ourOrderNo: string;
  itm: number;
  part: string;
  description: string;
  qOrd: number;
  qO: number;
  inWH: number;
  currency: string;
  unitPrice: number;
  total: number;
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
  'Account No',
  'Customer Name',
  'Your Order No',
  'Our Order No',
  'Itm',
  'Part',
  'Description',
  'Q Ord',
  'Q/O',
  'In WH',
  'Currency',
  'Unit Price',
  'Total',
];

function validateRow(row: BackOrderImportRow, rowNumber: number): string[] {
  const errors: string[] = [];

  // Validate Your Order No
  if (!row.yourOrderNo || row.yourOrderNo.toString().trim() === '') {
    errors.push('Your Order No is required');
  }

  // Validate Part
  if (!row.part || row.part.toString().trim() === '') {
    errors.push('Part is required');
  }

  // Validate Q Ord
  if (row.qOrd === null || row.qOrd === undefined) {
    errors.push('Q Ord is required');
  } else if (typeof row.qOrd !== 'number' || row.qOrd < 0) {
    errors.push('Q Ord must be a non-negative number');
  }

  // Validate Q/O
  if (row.qO === null || row.qO === undefined) {
    errors.push('Q/O is required');
  } else if (typeof row.qO !== 'number' || row.qO < 0) {
    errors.push('Q/O must be a non-negative number');
  }

  // Validate In WH
  if (row.inWH === null || row.inWH === undefined) {
    errors.push('In WH is required');
  } else if (typeof row.inWH !== 'number' || row.inWH < 0) {
    errors.push('In WH must be a non-negative number');
  }

  return errors;
}

export async function importBackOrders(
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
  validateHeaders(headers, REQUIRED_HEADERS, []);

  // Get column indices
  const columnIndices = createColumnIndexMap(headers);

  const errors: ImportError[] = [];
  const totalRows = worksheet.rowCount - 1; // Exclude header row

  // Create import log
  const importLog = await prisma.importLog.create({
    data: {
      type: ImportType.BACKORDER,
      fileName,
      fileSize,
      fileUrl: fileUrl || undefined,
      totalRows,
      importedBy: userId,
    },
  });

  // Update status to PROCESSING
  await prisma.importLog.update({
    where: { id: importLog.id },
    data: { importStatus: ImportStatus.PROCESSING },
  });

  let successCount = 0;

  // Process each row
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Skip empty rows
    if (row.cellCount === 0) {
      continue;
    }

    // Extract row data
    const rowData: BackOrderImportRow = {
      accountNo: extractCellValue(row.getCell(columnIndices['Account No'] + 1)),
      customerName: extractCellValue(row.getCell(columnIndices['Customer Name'] + 1)),
      yourOrderNo: extractCellValue(row.getCell(columnIndices['Your Order No'] + 1)),
      ourOrderNo: extractCellValue(row.getCell(columnIndices['Our Order No'] + 1)),
      itm: extractCellValue(row.getCell(columnIndices['Itm'] + 1)),
      part: extractCellValue(row.getCell(columnIndices['Part'] + 1)),
      description: extractCellValue(row.getCell(columnIndices['Description'] + 1)),
      qOrd: extractCellValue(row.getCell(columnIndices['Q Ord'] + 1)),
      qO: extractCellValue(row.getCell(columnIndices['Q/O'] + 1)),
      inWH: extractCellValue(row.getCell(columnIndices['In WH'] + 1)),
      currency: extractCellValue(row.getCell(columnIndices['Currency'] + 1)),
      unitPrice: extractCellValue(row.getCell(columnIndices['Unit Price'] + 1)),
      total: extractCellValue(row.getCell(columnIndices['Total'] + 1)),
    };

    // Validate row
    const validationErrors = validateRow(rowData, rowNumber);

    if (validationErrors.length > 0) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: validationErrors,
      });
      continue;
    }

    // Find order by orderNumber
    const order = await prisma.order.findUnique({
      where: {
        orderNumber: rowData.yourOrderNo?.toString().trim() || '',
      },
      select: {
        id: true,
      },
    });

    if (!order) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [`Order not found with Order Number: ${rowData.yourOrderNo}`],
      });
      continue;
    }

    // Find orderItem by orderId and productCode
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        orderId: order.id,
        productCode: rowData.part?.toString().trim() || '',
      },
    });

    if (!orderItem) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [`Order Item not found with Part: ${rowData.part} for Order: ${rowData.yourOrderNo}`],
      });
      continue;
    }

    try {
      // Use transaction to ensure data consistency
      await prisma.$transaction(async (tx) => {
        // Mark existing BackOrderLogs as status = false
        await tx.backOrderLogs.updateMany({
          where: {
            orderItemId: orderItem.id,
            status: true,
          },
          data: {
            status: false,
          },
        });

        // Create new BackOrderLogs entry
        await tx.backOrderLogs.create({
          data: {
            orderItemId: orderItem.id,
            qtyOrdered: rowData.qOrd,
            qtyOutstanding: rowData.qO,
            inWarehouse: rowData.inWH,
          },
        });

        // Update OrderItem
        await tx.orderItem.update({
          where: {
            id: orderItem.id,
          },
          data: {
            qtyOrdered: rowData.qOrd,
            qtyOutstanding: rowData.qO,
            inWarehouse: rowData.inWH,
          },
        });
      });

      successCount++;
    } catch (error) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [error instanceof Error ? error.message : 'Failed to update backorder'],
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
