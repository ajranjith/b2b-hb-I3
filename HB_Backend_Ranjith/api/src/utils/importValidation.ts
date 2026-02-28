import ExcelJS from 'exceljs';
import { HTTPException } from 'hono/http-exception';
import { extractHeaders, validateHeaders, loadWorkbook } from './importHelpers';

/**
 * Pre-validate Excel file before starting background job
 * This runs synchronously to give immediate feedback
 */
export async function preValidateProductsFile(fileBuffer: ArrayBuffer): Promise<{
  isValid: boolean;
  totalRows: number;
  sheetName: string;
}> {
  let workbook: ExcelJS.Workbook;
  let worksheet: ExcelJS.Worksheet;

  // Load workbook (supports both Excel and CSV)
  workbook = await loadWorkbook(fileBuffer);

  // Validate: Has at least one worksheet
  worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HTTPException(400, {
      message: 'No worksheet found in the Excel file. Please ensure the file contains data.',
    });
  }

  // Validate: Has at least 2 rows (header + data)
  if (worksheet.rowCount < 2) {
    throw new HTTPException(400, {
      message: 'File must contain at least a header row and one data row.',
    });
  }

  // Validate: Headers are correct
  let headers: string[];
  try {
    headers = extractHeaders(worksheet);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to extract headers from the file. Please ensure the first row contains column headers.',
    });
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
    'Discount Code',
  ];

  // This will throw HTTPException if headers are invalid
  validateHeaders(headers, REQUIRED_HEADERS, []);

  const totalRows = worksheet.rowCount - 1; // Exclude header row

  return {
    isValid: true,
    totalRows,
    sheetName: worksheet.name,
  };
}

/**
 * Pre-validate Excel file for dealers import
 */
export async function preValidateDealersFile(fileBuffer: ArrayBuffer): Promise<{
  isValid: boolean;
  totalRows: number;
  sheetName: string;
}> {
  let workbook: ExcelJS.Workbook;
  let worksheet: ExcelJS.Worksheet;

  // Load workbook (supports both Excel and CSV)
  workbook = await loadWorkbook(fileBuffer);

  // Validate: Has at least one worksheet
  worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HTTPException(400, {
      message: 'No worksheet found in the Excel file. Please ensure the file contains data.',
    });
  }

  // Validate: Has at least 2 rows (header + data)
  if (worksheet.rowCount < 2) {
    throw new HTTPException(400, {
      message: 'File must contain at least a header row and one data row.',
    });
  }

  // Validate: Headers are correct
  let headers: string[];
  try {
    headers = extractHeaders(worksheet);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to extract headers from the file. Please ensure the first row contains column headers.',
    });
  }

  const REQUIRED_HEADERS = [
    'Account Number',
    'Company Name',
    'First Name',
    'Last Name',
    'Email',
    'Genuine Parts Tier',
    'Aftermarket ES Tier',
    'Aftermarket B Tier',
    'Temp password',
    'Status',
  ];

  const OPTIONAL_HEADERS = ['Default shipping Method', 'Notes'];

  // This will throw HTTPException if headers are invalid
  validateHeaders(headers, REQUIRED_HEADERS, OPTIONAL_HEADERS);

  const totalRows = worksheet.rowCount - 1; // Exclude header row

  return {
    isValid: true,
    totalRows,
    sheetName: worksheet.name,
  };
}

/**
 * Pre-validate Excel file for superseded mappings import
 */
export async function preValidateSupersededFile(fileBuffer: ArrayBuffer): Promise<{
  isValid: boolean;
  totalRows: number;
  sheetName: string;
}> {
  let workbook: ExcelJS.Workbook;
  let worksheet: ExcelJS.Worksheet;

  // Load workbook (supports both Excel and CSV)
  workbook = await loadWorkbook(fileBuffer);

  // Validate: Has at least one worksheet
  worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HTTPException(400, {
      message: 'No worksheet found in the Excel file. Please ensure the file contains data.',
    });
  }

  // Validate: Has at least 2 rows (header + data)
  if (worksheet.rowCount < 2) {
    throw new HTTPException(400, {
      message: 'File must contain at least a header row and one data row.',
    });
  }

  // Validate: Headers are correct
  let headers: string[];
  try {
    headers = extractHeaders(worksheet);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to extract headers from the file. Please ensure the first row contains column headers.',
    });
  }

  const REQUIRED_HEADERS = ['FROMPARTNO', 'TOPARTNO'];

  // This will throw HTTPException if headers are invalid
  validateHeaders(headers, REQUIRED_HEADERS, []);

  const totalRows = worksheet.rowCount - 1; // Exclude header row

  return {
    isValid: true,
    totalRows,
    sheetName: worksheet.name,
  };
}

/**
 * Pre-validate Excel file for backorder import
 */
export async function preValidateBackOrderFile(fileBuffer: ArrayBuffer): Promise<{
  isValid: boolean;
  totalRows: number;
  sheetName: string;
}> {
  let workbook: ExcelJS.Workbook;
  let worksheet: ExcelJS.Worksheet;

  // Load workbook (supports both Excel and CSV)
  workbook = await loadWorkbook(fileBuffer);

  // Validate: Has at least one worksheet
  worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HTTPException(400, {
      message: 'No worksheet found in the Excel file. Please ensure the file contains data.',
    });
  }

  // Validate: Has at least 2 rows (header + data)
  if (worksheet.rowCount < 2) {
    throw new HTTPException(400, {
      message: 'File must contain at least a header row and one data row.',
    });
  }

  // Validate: Headers are correct
  let headers: string[];
  try {
    headers = extractHeaders(worksheet);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to extract headers from the file. Please ensure the first row contains column headers.',
    });
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

  // This will throw HTTPException if headers are invalid
  validateHeaders(headers, REQUIRED_HEADERS, []);

  const totalRows = worksheet.rowCount - 1; // Exclude header row

  return {
    isValid: true,
    totalRows,
    sheetName: worksheet.name,
  };
}

/**
 * Pre-validate Excel file for order status import
 */
export async function preValidateOrderStatusFile(fileBuffer: ArrayBuffer): Promise<{
  isValid: boolean;
  totalRows: number;
  sheetName: string;
}> {
  let workbook: ExcelJS.Workbook;
  let worksheet: ExcelJS.Worksheet;

  // Load workbook (supports both Excel and CSV)
  workbook = await loadWorkbook(fileBuffer);

  // Validate: Has at least one worksheet
  worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HTTPException(400, {
      message: 'No worksheet found in the Excel file. Please ensure the file contains data.',
    });
  }

  // Validate: Has at least 2 rows (header + data)
  if (worksheet.rowCount < 2) {
    throw new HTTPException(400, {
      message: 'File must contain at least a header row and one data row.',
    });
  }

  // Validate: Headers are correct
  let headers: string[];
  try {
    headers = extractHeaders(worksheet);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to extract headers from the file. Please ensure the first row contains column headers.',
    });
  }

  const REQUIRED_HEADERS = ['Your Order No', 'Our Order No', 'Status'];

  // This will throw HTTPException if headers are invalid
  validateHeaders(headers, REQUIRED_HEADERS, []);

  const totalRows = worksheet.rowCount - 1; // Exclude header row

  return {
    isValid: true,
    totalRows,
    sheetName: worksheet.name,
  };
}
