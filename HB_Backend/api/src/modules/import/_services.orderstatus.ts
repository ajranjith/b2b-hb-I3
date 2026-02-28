import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { ImportType, ImportStatus, OrderStatus } from 'generated/prisma';
import { HTTPException } from 'hono/http-exception';
import { extractCellValue, extractHeaders, validateHeaders, createColumnIndexMap, loadWorkbook } from '@/utils/importHelpers';

interface OrderStatusImportRow {
  yourOrderNo: string;
  ourOrderNo: string;
  status: string;
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

const REQUIRED_HEADERS = ['Your Order No', 'Our Order No', 'Status'];

// Status mapping from Excel values to OrderStatus enum
const STATUS_MAPPING: Record<string, OrderStatus> = {
  // Case-insensitive mappings
  created: 'CREATED',
  backorder: 'BACKORDER',
  'ready for shipment': 'READY_FOR_SHIPMENT',
  'ready_for_shipment': 'READY_FOR_SHIPMENT',
  'readyforshipment': 'READY_FOR_SHIPMENT',
  fullfilled: 'FULLFILLED',
  fulfilled: 'FULLFILLED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  processing: 'PROCESSING',
  // New mappings from Portal Orders Extract
  pur: 'BACKORDER',
  sbo: 'BACKORDER',
  piq: 'PICKING',
  pik: 'PICKING',
  adv: 'PACKING',
  wdl: 'OUT_FOR_DELIVERY',
  pro: 'PROCESSING',
};

function mapStatus(excelStatus: string): OrderStatus | null {
  if (!excelStatus) {
    return null;
  }

  const normalized = excelStatus.trim().toLowerCase();
  return STATUS_MAPPING[normalized] || null;
}

function validateRow(row: OrderStatusImportRow, rowNumber: number): string[] {
  const errors: string[] = [];

  // Validate Your Order No
  if (!row.yourOrderNo || row.yourOrderNo.trim() === '') {
    errors.push('Your Order No is required');
  }

  // Validate Status
  if (!row.status || row.status.trim() === '') {
    errors.push('Status is required');
  } else {
    const mappedStatus = mapStatus(row.status);
    if (!mappedStatus) {
      const validStatuses = Object.keys(STATUS_MAPPING).join(', ');
      errors.push(
        `Invalid status: "${row.status}". Valid values are: ${validStatuses} (case-insensitive)`
      );
    }
  }

  return errors;
}

export async function importOrderStatus(
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
      type: ImportType.ORDER_STATUS,
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
    const rowData: OrderStatusImportRow = {
      yourOrderNo: extractCellValue(row.getCell(columnIndices['Your Order No'] + 1)),
      ourOrderNo: extractCellValue(row.getCell(columnIndices['Our Order No'] + 1)),
      status: extractCellValue(row.getCell(columnIndices['Status'] + 1)),
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

    // Map status
    const newStatus = mapStatus(rowData.status);
    if (!newStatus) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [`Unable to map status: ${rowData.status}`],
      });
      continue;
    }

    // Find order by orderNumber
    const order = await prisma.order.findUnique({
      where: {
        orderNumber: rowData.yourOrderNo.trim(),
      },
      select: {
        id: true,
        orderStatus: true,
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

    try {
      // Use transaction to ensure data consistency
      await prisma.$transaction(async (tx) => {
        // Mark existing OrderStatusLog as status = false
        await tx.orderStatusLog.updateMany({
          where: {
            orderId: order.id,
            status: true,
          },
          data: {
            status: false,
          },
        });

        // Create new OrderStatusLog entry
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            k8OrderNo: rowData.ourOrderNo?.trim() || null,
            orderStatus: newStatus,
            notes: 'Status updated via import',
          },
        });

        // Update Order with new status and k8OrderNo
        await tx.order.update({
          where: {
            id: order.id,
          },
          data: {
            orderStatus: newStatus,
            k8OrderNo: rowData.ourOrderNo?.trim() || null,
          },
        });

        // Also create entry in OrderStatusHistory (existing history table)
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            oldStatus: order.orderStatus,
            newStatus: newStatus,
            changedBy: userId || null,
            notes: 'Status updated via import',
          },
        });
      });

      successCount++;
    } catch (error) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: [error instanceof Error ? error.message : 'Failed to update order status'],
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
