import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { DealerTier, DealerAccountStatus, Role, ImportType, ImportStatus } from 'generated/prisma';
import { HTTPException } from 'hono/http-exception';
import { loadWorkbook } from '@/utils/importHelpers';

interface DealerImportRow {
  accountNumber: number;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  genuinePartsTier: string;
  aftermarketESTier: string;
  aftermarketBTier: string;
  tempPassword: string;
  status: string;
  defaultShippingMethod?: string;
  notes?: string;
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

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

function validateHeaders(headers: string[]): void {
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid Excel structure. Missing required headers: ${missingHeaders.join(', ')}`,
    });
  }

  console.log('headers', headers);

  // Check for unexpected headers
  const unexpectedHeaders = headers.filter((header) => !ALL_HEADERS.includes(header));
  if (unexpectedHeaders.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid Excel structure. Unexpected headers: ${unexpectedHeaders.join(', ')}`,
    });
  }
}

function extractCellValue(cell: ExcelJS.Cell): any {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }

  // Handle hyperlink cells (for email)
  if (typeof cell.value === 'object' && 'text' in cell.value) {
    return cell.value.text;
  }

  return cell.value;
}

function validateDealerTier(tier: string, fieldName: string): string[] {
  const errors: string[] = [];
  const validTiers = Object.values(DealerTier);

  if (!tier) {
    errors.push(`${fieldName} is required`);
  } else if (!validTiers.includes(tier as DealerTier)) {
    errors.push(`${fieldName} must be one of: ${validTiers.join(', ')}`);
  }

  return errors;
}

function validateAccountStatus(status: string): string[] {
  const errors: string[] = [];
  const validStatuses = Object.values(DealerAccountStatus);

  if (!status) {
    errors.push('Status is required');
  } else if (!validStatuses.includes(status as DealerAccountStatus)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  return errors;
}

function validateEmail(email: string): string[] {
  const errors: string[] = [];

  if (!email) {
    errors.push('Email is required');
    return errors;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push('Invalid email format');
  }

  return errors;
}

/**
 * Resolve shipping method to ID from name or ID string
 * Returns null if not found or empty
 */
function resolveShippingMethodId(
  value: string | undefined,
  shippingMethodMap: Map<string, number>
): number | null {
  if (!value || !value.trim()) {
    return null;
  }

  const trimmedValue = value.trim();

  // Try to parse as ID first
  const parsedId = parseInt(trimmedValue, 10);
  if (!isNaN(parsedId) && parsedId > 0) {
    // Check if this ID exists in the map values
    for (const [_, id] of shippingMethodMap) {
      if (id === parsedId) {
        return parsedId;
      }
    }
  }

  // Try to find by name (case-insensitive)
  const lowerValue = trimmedValue.toLowerCase();
  for (const [name, id] of shippingMethodMap) {
    if (name.toLowerCase() === lowerValue) {
      return id;
    }
  }

  // Not found
  return null;
}

function validateRow(row: DealerImportRow, rowNumber: number): string[] {
  const errors: string[] = [];

  // Validate account number
  if (!row.accountNumber) {
    errors.push('Account Number is required');
  } else if (typeof row.accountNumber !== 'number' || row.accountNumber <= 0) {
    errors.push('Account Number must be a positive number');
  }

  // Validate company name
  if (!row.companyName || row.companyName.trim() === '') {
    errors.push('Company Name is required');
  }

  // Validate first name
  if (!row.firstName || row.firstName.trim() === '') {
    errors.push('First Name is required');
  }

  // Validate last name
  if (!row.lastName || row.lastName.trim() === '') {
    errors.push('Last Name is required');
  }

  // Validate email
  errors.push(...validateEmail(row.email));

  // Validate tiers
  errors.push(...validateDealerTier(row.genuinePartsTier, 'Genuine Parts Tier'));
  errors.push(...validateDealerTier(row.aftermarketESTier, 'Aftermarket ES Tier'));
  errors.push(...validateDealerTier(row.aftermarketBTier, 'Aftermarket B Tier'));

  // Validate status
  errors.push(...validateAccountStatus(row.status));

  // Validate password
  if (!row.tempPassword || row.tempPassword.trim() === '') {
    errors.push('Temp password is required');
  } else if (row.tempPassword.length < 6) {
    errors.push('Temp password must be at least 6 characters long');
  }

  return errors;
}

export async function importDealers(
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
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => {
    const value = extractCellValue(cell);
    if (value) {
      headers.push(value.toString().trim());
    }
  });

  validateHeaders(headers);

  // Get column indices
  const columnIndices: { [key: string]: number } = {};
  headers.forEach((header, index) => {
    columnIndices[header] = index;
  });

  const errors: ImportError[] = [];
  const totalRows = worksheet.rowCount - 1; // Exclude header row

  // Create import log
  const importLog = await prisma.importLog.create({
    data: {
      type: ImportType.DEALERS,
      fileName,
      fileSize,
      fileUrl: fileUrl || undefined,
      totalRows,
      importedBy: userId,
    },
  });

  // Get dealer role
  const dealerRole = await prisma.userRole.findFirst({
    where: { code: Role.Dealer },
  });

  if (!dealerRole) {
    throw new HTTPException(500, { message: 'Dealer role not found in the system' });
  }

  // Load all shipping methods for lookup
  const shippingMethods = await prisma.shippingMethod.findMany({
    where: { status: true },
    select: { id: true, name: true },
  });

  // Create map: name -> id
  const shippingMethodMap = new Map<string, number>();
  for (const method of shippingMethods) {
    shippingMethodMap.set(method.name, method.id);
  }

  console.log(`[Dealer Import] Loaded ${shippingMethods.length} shipping methods for lookup`);

  // Step 1: Extract, validate, and check for duplicates in a single pass
  const validUniqueRows: Array<{ rowNumber: number; data: DealerImportRow }> = [];
  const emailMap = new Map<string, number>();
  const accountNumberMap = new Map<number, number>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Skip empty rows
    if (row.cellCount === 0) {
      continue;
    }

    // Extract row data
    const rowData: DealerImportRow = {
      accountNumber: extractCellValue(row.getCell(columnIndices['Account Number'] + 1)),
      companyName: extractCellValue(row.getCell(columnIndices['Company Name'] + 1)),
      firstName: extractCellValue(row.getCell(columnIndices['First Name'] + 1)),
      lastName: extractCellValue(row.getCell(columnIndices['Last Name'] + 1)),
      email: extractCellValue(row.getCell(columnIndices['Email'] + 1)),
      genuinePartsTier: extractCellValue(row.getCell(columnIndices['Genuine Parts Tier'] + 1)),
      aftermarketESTier: extractCellValue(row.getCell(columnIndices['Aftermarket ES Tier'] + 1)),
      aftermarketBTier: extractCellValue(row.getCell(columnIndices['Aftermarket B Tier'] + 1)),
      tempPassword: extractCellValue(row.getCell(columnIndices['Temp password'] + 1)),
      status: extractCellValue(row.getCell(columnIndices['Status'] + 1)),
      defaultShippingMethod: columnIndices['Default Shipping Method']
        ? extractCellValue(row.getCell(columnIndices['Default Shipping Method'] + 1))
        : undefined,
      notes: columnIndices['Notes'] ? extractCellValue(row.getCell(columnIndices['Notes'] + 1)) : undefined,
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

    // Check for duplicates within the file
    const email = rowData.email.toLowerCase().trim();
    const accountNumber = rowData.accountNumber;
    const duplicateErrors: string[] = [];

    if (emailMap.has(email)) {
      duplicateErrors.push(`Duplicate email in file (first occurrence at row ${emailMap.get(email)})`);
    }

    if (accountNumberMap.has(accountNumber)) {
      duplicateErrors.push(`Duplicate account number in file (first occurrence at row ${accountNumberMap.get(accountNumber)})`);
    }

    if (duplicateErrors.length > 0) {
      errors.push({
        row: rowNumber,
        data: rowData,
        errors: duplicateErrors,
      });
      continue;
    }

    // Track this row and continue
    emailMap.set(email, rowNumber);
    accountNumberMap.set(accountNumber, rowNumber);
    validUniqueRows.push({ rowNumber, data: rowData });
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

  // Step 3: Query existing users and dealers in bulk
  const allEmails = validUniqueRows.map(({ data }) => data.email.toLowerCase().trim());
  const allAccountNumbers = validUniqueRows.map(({ data }) => data.accountNumber);

  const existingUsers = await prisma.user.findMany({
    where: {
      email: { in: allEmails },
    },
    include: {
      dealer: true,
    },
  });

  const existingUserMap = new Map(existingUsers.map((user) => [user.email, user]));

  const existingDealers = await prisma.userDealer.findMany({
    where: {
      accountNumber: { in: allAccountNumbers },
    },
  });

  const existingDealerMap = new Map(existingDealers.map((dealer) => [dealer.accountNumber, dealer]));

  // Step 4: Separate into new users and existing users
  const newUsers: Array<{ rowNumber: number; data: DealerImportRow; hashedPassword: string }> = [];
  const existingUsersToUpdate: Array<{ rowNumber: number; data: DealerImportRow; userId: number }> = [];

  for (const { rowNumber, data } of validUniqueRows) {
    const email = data.email.toLowerCase().trim();
    const existingUser = existingUserMap.get(email);

    if (existingUser) {
      // Check if account number conflicts with a different user
      const existingDealer = existingDealerMap.get(data.accountNumber);
      if (existingDealer && existingDealer.userId !== existingUser.id) {
        errors.push({
          row: rowNumber,
          data,
          errors: ['Account Number already exists for a different user'],
        });
        continue;
      }

      existingUsersToUpdate.push({ rowNumber, data, userId: existingUser.id });
    } else {
      // Check if account number exists without matching email
      const existingDealer = existingDealerMap.get(data.accountNumber);
      if (existingDealer) {
        errors.push({
          row: rowNumber,
          data,
          errors: ['Account Number already exists for a different email'],
        });
        continue;
      }

      // Hash password for new users
      const hashedPassword = await Bun.password.hash(data.tempPassword);
      newUsers.push({ rowNumber, data, hashedPassword });
    }
  }

  let successCount = 0;

  // Step 5: Bulk insert new users
  if (newUsers.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        // Create users
        const createdUsers = await tx.user.createManyAndReturn({
          data: newUsers.map(({ data, hashedPassword }) => ({
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            email: data.email.toLowerCase().trim(),
            password: hashedPassword,
            roleId: dealerRole.id,
          })),
        });

        // Create dealers
        await tx.userDealer.createMany({
          data: createdUsers.map((user, index) => ({
            userId: user.id,
            accountNumber: newUsers[index].data.accountNumber,
            companyName: newUsers[index].data.companyName.trim(),
            genuinePartsTier: newUsers[index].data.genuinePartsTier as DealerTier,
            aftermarketESTier: newUsers[index].data.aftermarketESTier as DealerTier,
            aftermarketBTier: newUsers[index].data.aftermarketBTier as DealerTier,
            accountStatus: newUsers[index].data.status as DealerAccountStatus,
            defaultShippingMethodId: resolveShippingMethodId(
              newUsers[index].data.defaultShippingMethod,
              shippingMethodMap
            ),
            notes: newUsers[index].data.notes?.trim(),
          })),
        });
      });

      successCount += newUsers.length;
    } catch (error) {
      // If bulk insert fails, add all as errors
      newUsers.forEach(({ rowNumber, data }) => {
        errors.push({
          row: rowNumber,
          data,
          errors: [error instanceof Error ? error.message : 'Failed to create user'],
        });
      });
    }
  }

  // Step 6: Update existing users (excluding password)
  for (const { rowNumber, data, userId } of existingUsersToUpdate) {
    try {
      await prisma.$transaction(async (tx) => {
        // Update user (excluding password)
        await tx.user.update({
          where: { id: userId },
          data: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
          },
        });

        // Upsert dealer
        await tx.userDealer.upsert({
          where: { userId },
          create: {
            userId,
            accountNumber: data.accountNumber,
            companyName: data.companyName.trim(),
            genuinePartsTier: data.genuinePartsTier as DealerTier,
            aftermarketESTier: data.aftermarketESTier as DealerTier,
            aftermarketBTier: data.aftermarketBTier as DealerTier,
            accountStatus: data.status as DealerAccountStatus,
            defaultShippingMethodId: resolveShippingMethodId(data.defaultShippingMethod, shippingMethodMap),
            notes: data.notes?.trim(),
          },
          update: {
            accountNumber: data.accountNumber,
            companyName: data.companyName.trim(),
            genuinePartsTier: data.genuinePartsTier as DealerTier,
            aftermarketESTier: data.aftermarketESTier as DealerTier,
            aftermarketBTier: data.aftermarketBTier as DealerTier,
            accountStatus: data.status as DealerAccountStatus,
            defaultShippingMethodId: resolveShippingMethodId(data.defaultShippingMethod, shippingMethodMap),
            notes: data.notes?.trim(),
          },
        });
      });

      successCount++;
    } catch (error) {
      errors.push({
        row: rowNumber,
        data,
        errors: [error instanceof Error ? error.message : 'Failed to update user'],
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

// List imports with pagination and filtering
export async function listImports(query: {
  page: number;
  limit: number;
  status?: ImportStatus;
  type?: ImportType;
}) {
  const { page, limit, status, type } = query;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    status: true, // Only active imports
  };

  if (status) {
    where.importStatus = status;
  }

  if (type) {
    where.type = type;
  }

  // Get total count
  const total = await prisma.importLog.count({ where });

  // Get paginated imports with error logs
  const imports = await prisma.importLog.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' }, // Sort by latest first
    include: {
      importedByUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      errors: {
        where: {
          status: true, // Only active errors
        },
        orderBy: { rowNumber: 'asc' },
        take: 100, // Limit errors per import to avoid huge responses
      },
    },
  });

  // Format imports
  const formattedImports = imports.map((importLog) => ({
    id: importLog.id,
    type: importLog.type,
    importStatus: importLog.importStatus,
    importSource: importLog.importSource,
    fileName: importLog.fileName,
    fileSize: importLog.fileSize,
    fileUrl: importLog.fileUrl,
    sharePointFileId: importLog.sharePointFileId,
    sharePointFileModifiedDate: importLog.sharePointFileModifiedDate,
    totalRows: importLog.totalRows,
    successCount: importLog.successCount,
    errorCount: importLog.errorCount,
    importedBy: importLog.importedByUser
      ? {
          id: importLog.importedByUser.id,
          name: [importLog.importedByUser.firstName, importLog.importedByUser.lastName]
            .filter(Boolean)
            .join(' ')
            .trim(),
          email: importLog.importedByUser.email,
        }
      : null,
    startedAt: importLog.startedAt,
    completedAt: importLog.completedAt,
    durationMs: importLog.durationMs,
    createdAt: importLog.createdAt,
    updatedAt: importLog.updatedAt,
    errors: importLog.errors.map((error) => ({
      id: error.id,
      rowNumber: error.rowNumber,
      rowData: error.rowData,
      errors: error.errors,
      createdAt: error.createdAt,
    })),
  }));

  return {
    imports: formattedImports,
    total,
  };
}

// Get import error logs by import ID with pagination
export async function getImportErrors(importLogId: number, query: { page: number; limit: number }) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  // Verify import log exists
  const importLog = await prisma.importLog.findUnique({
    where: { id: importLogId },
    select: { id: true },
  });

  if (!importLog) {
    throw new HTTPException(404, { message: 'Import log not found' });
  }

  // Build where clause
  const where = {
    importLogId,
    status: true, // Only active errors
  };

  // Get total count
  const total = await prisma.importErrorsLog.count({ where });

  // Get paginated error logs
  const errors = await prisma.importErrorsLog.findMany({
    where,
    skip,
    take: limit,
    orderBy: { rowNumber: 'asc' }, // Sort by row number
  });

  // Format error logs
  const formattedErrors = errors.map((error) => ({
    id: error.id,
    rowNumber: error.rowNumber,
    rowData: error.rowData,
    errors: error.errors,
    createdAt: error.createdAt,
    updatedAt: error.updatedAt,
  }));

  return {
    errors: formattedErrors,
    total,
  };
}

// Get import statistics (totalRows, successCount, errorCount) by import ID
export async function getImportStats(importLogId: number) {
  const importLog = await prisma.importLog.findUnique({
    where: { id: importLogId },
    select: {
      id: true,
      totalRows: true,
      successCount: true,
      errorCount: true,
    },
  });

  if (!importLog) {
    throw new HTTPException(404, { message: 'Import log not found' });
  }

  return {
    totalRows: importLog.totalRows,
    successCount: importLog.successCount,
    errorCount: importLog.errorCount,
  };
}

// Export import error logs to Excel by import ID
export async function exportImportErrorsToExcel(importLogId: number): Promise<Buffer> {
  // Verify import log exists
  const importLog = await prisma.importLog.findUnique({
    where: { id: importLogId },
    select: {
      id: true,
      fileName: true,
      type: true,
    },
  });

  if (!importLog) {
    throw new HTTPException(404, { message: 'Import log not found' });
  }

  // Build where clause
  const where = {
    importLogId,
    status: true, // Only active errors
  };

  // Get all error logs (no pagination for export)
  const errors = await prisma.importErrorsLog.findMany({
    where,
    orderBy: { rowNumber: 'asc' },
  });

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Import Errors');

  // Define columns
  worksheet.columns = [
    { header: 'Row Number', key: 'rowNumber', width: 15 },
    { header: 'Errors', key: 'errors', width: 50 },
    { header: 'Row Data', key: 'rowData', width: 80 },
    { header: 'Created At', key: 'createdAt', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add error data
  errors.forEach((error) => {
    const rowData: any = {
      rowNumber: error.rowNumber,
      errors: error.errors.join('; '), // Join multiple errors with semicolon
      rowData: JSON.stringify(error.rowData), // Convert JSON to string
      createdAt: error.createdAt.toLocaleString(),
    };

    worksheet.addRow(rowData);
  });

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    if (column.width) {
      column.width = Math.min(column.width || 10, 50);
    }
  });

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
