import { HTTPException } from 'hono/http-exception';

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

export const DEFAULT_FILE_VALIDATION: FileValidationOptions = {
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/msexcel', // .xls (alternative)
    'application/x-msexcel', // .xls (alternative)
    'application/x-ms-excel', // .xls (alternative)
    'application/x-excel', // .xls (alternative)
    'application/x-dos_ms_excel', // .xls (alternative)
    'application/xls', // .xls (alternative)
    'application/x-xls', // .xls (alternative)
    'text/csv', // .csv
    'application/csv', // .csv (alternative)
    'text/x-csv', // .csv (alternative)
    'application/octet-stream', // Generic binary file (common on some systems)
    '', // Empty MIME type (some browsers don't set it)
  ],
  allowedExtensions: ['.xlsx', '.xls', '.csv'],
};

export function validateFile(file: File, options: FileValidationOptions = DEFAULT_FILE_VALIDATION): void {
  // Check if file exists
  if (!file) {
    throw new HTTPException(400, { message: 'No file provided' });
  }

  // Check if file has required properties (works for File and Blob in Bun)
  if (typeof file !== 'object' || !('name' in file) || !('size' in file)) {
    throw new HTTPException(400, { message: 'Invalid file: missing required properties' });
  }

  if (!file.name) {
    throw new HTTPException(400, { message: 'Invalid file: missing file name' });
  }

  if (typeof file.size !== 'number') {
    throw new HTTPException(400, { message: 'Invalid file: missing file size' });
  }

  // Validate file size
  if (options.maxSizeBytes && file.size > options.maxSizeBytes) {
    throw new HTTPException(400, {
      message: `File size exceeds maximum limit of ${options.maxSizeBytes / 1024 / 1024}MB`,
    });
  }

  // Validate file extension (primary validation - most reliable)
  if (options.allowedExtensions) {
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!options.allowedExtensions.includes(fileExtension)) {
      throw new HTTPException(400, {
        message: `Invalid file extension. Allowed extensions: ${options.allowedExtensions.join(', ')}`,
      });
    }
  }

  // Validate MIME type (secondary validation - only if specific type is set)
  // Skip validation for generic/empty MIME types as they vary by system
  const genericMimeTypes = ['application/octet-stream', '', 'application/x-download'];
  if (
    options.allowedMimeTypes &&
    file.type &&
    !genericMimeTypes.includes(file.type) &&
    !options.allowedMimeTypes.includes(file.type)
  ) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed types: ${options.allowedExtensions?.join(', ')}`,
    });
  }
}

export async function getFileBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}
