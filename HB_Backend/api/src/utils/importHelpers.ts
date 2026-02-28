import ExcelJS from 'exceljs';
import { HTTPException } from 'hono/http-exception';
import { Readable } from 'stream';

/**
 * Extract cell value from ExcelJS cell, handling hyperlinks and other formats
 */
export function extractCellValue(cell: ExcelJS.Cell): any {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }

  // Handle hyperlink cells (for email, etc.)
  if (typeof cell.value === 'object' && 'text' in cell.value) {
    return cell.value.text;
  }

  return cell.value;
}

/**
 * Validate Excel headers against required and optional headers
 */
export function validateHeaders(
  actualHeaders: string[],
  requiredHeaders: string[],
  optionalHeaders: string[] = []
): void {
  const missingHeaders = requiredHeaders.filter((header) => !actualHeaders.includes(header));

  if (missingHeaders.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid Excel structure. Missing required headers: ${missingHeaders.join(', ')}`,
    });
  }

  const allAllowedHeaders = [...requiredHeaders, ...optionalHeaders];
  const unexpectedHeaders = actualHeaders.filter((header) => !allAllowedHeaders.includes(header));

  if (unexpectedHeaders.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid Excel structure. Unexpected headers: ${unexpectedHeaders.join(', ')}`,
    });
  }
}

/**
 * Extract headers from the first row of a worksheet
 */
export function extractHeaders(worksheet: ExcelJS.Worksheet): string[] {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell((cell) => {
    const value = extractCellValue(cell);
    if (value) {
      headers.push(value.toString().trim());
    }
  });

  return headers;
}

/**
 * Create a column index map from headers
 */
export function createColumnIndexMap(headers: string[]): { [key: string]: number } {
  const columnIndices: { [key: string]: number } = {};
  headers.forEach((header, index) => {
    columnIndices[header] = index;
  });
  return columnIndices;
}

/**
 * Extract row data based on column indices
 */
export function extractRowData<T>(
  row: ExcelJS.Row,
  columnIndices: { [key: string]: number },
  mapping: { [key in keyof T]: string }
): Partial<T> {
  const rowData: any = {};

  for (const [key, headerName] of Object.entries(mapping)) {
    const columnIndex = columnIndices[headerName as string];
    if (columnIndex !== undefined) {
      rowData[key] = extractCellValue(row.getCell(columnIndex + 1));
    }
  }

  return rowData as Partial<T>;
}

/**
 * Detect file type based on content or file signature
 */
function detectFileType(fileBuffer: ArrayBuffer, fileName?: string): 'excel' | 'csv' | 'unknown' {
  // Check by file extension first (if available)
  if (fileName) {
    const extension = fileName.toLowerCase().split('.').pop();
    if (extension === 'csv') return 'csv';
    if (extension === 'xlsx' || extension === 'xls') return 'excel';
  }

  // Check by file signature (magic bytes)
  const bytes = new Uint8Array(fileBuffer.slice(0, 4));

  // ZIP signature (XLSX files start with PK - 0x504B)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    return 'excel';
  }

  // Check if it looks like CSV (starts with printable ASCII characters)
  const firstByte = bytes[0];
  if (firstByte >= 0x20 && firstByte <= 0x7E) {
    return 'csv';
  }

  return 'unknown';
}

/**
 * Load workbook from buffer, supporting both Excel (XLSX/XLS) and CSV files
 *
 * @param fileBuffer - The file buffer to load
 * @param fileName - Optional file name for better type detection
 * @returns Promise<ExcelJS.Workbook>
 * @throws HTTPException if file format is invalid
 */
export async function loadWorkbook(
  fileBuffer: ArrayBuffer,
  fileName?: string
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const fileType = detectFileType(fileBuffer, fileName);

  try {
    if (fileType === 'csv') {
      // Load as CSV
      const csvText = new TextDecoder().decode(fileBuffer);
      const stream = Readable.from([csvText]);
      await workbook.csv.read(stream);
    } else if (fileType === 'excel') {
      // Load as Excel
      await workbook.xlsx.load(fileBuffer);
    } else {
      // Unknown type, try Excel first then CSV
      try {
        await workbook.xlsx.load(fileBuffer);
      } catch (xlsxError) {
        // If Excel loading fails, try CSV
        const csvText = new TextDecoder().decode(fileBuffer);
        const stream = Readable.from([csvText]);
        await workbook.csv.read(stream);
      }
    }

    return workbook;
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Invalid file format. Please upload a valid XLSX, XLS, or CSV file.',
    });
  }
}
