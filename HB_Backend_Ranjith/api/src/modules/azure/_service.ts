import { getBlobServiceClient, getContainerName, getCacheControl, shouldOverwriteFiles, generateBlobSASUrl } from '@/lib/azure';
import { HTTPException } from 'hono/http-exception';
import type { ImportType } from 'generated/prisma';

/**
 * Upload file to Azure Blob Storage
 */
export async function uploadFileToAzure(file: File): Promise<string> {
  try {
    const blobServiceClient = getBlobServiceClient();
    const containerName = getContainerName();

    // Ensure container exists
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    // Generate unique blob name with original filename
    const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const blobName = `${uniqueId}${fileExtension}`;

    // Get blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Read file buffer
    const fileBuffer = await file.arrayBuffer();

    // Check if blob already exists (if overwrite is disabled)
    if (!shouldOverwriteFiles()) {
      const exists = await blockBlobClient.exists();
      if (exists) {
        throw new HTTPException(409, {
          message: `File with name ${blobName} already exists. Overwriting is disabled.`,
        });
      }
    }

    // Determine content disposition based on file type
    const viewableTypes = [
      'image/',
      'application/pdf',
      'text/',
      'video/',
      'audio/',
    ];
    const isViewable = viewableTypes.some(type => (file.type || '').startsWith(type));
    const contentDisposition = isViewable ? 'inline' : 'attachment';

    // Upload file to Azure
    await blockBlobClient.uploadData(new Uint8Array(fileBuffer), {
      blobHTTPHeaders: {
        blobContentType: file.type || 'application/octet-stream',
        blobCacheControl: getCacheControl(),
        blobContentDisposition: `${contentDisposition}; filename="${file.name}"`,
      },
    });

    // Generate SAS URL for accessing the file (valid for 1 year by default)
    const blobUrl = generateBlobSASUrl(containerName, blobName);

    return blobUrl;
  } catch (error) {
    console.error('[Azure Upload] Error uploading file:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('credentials')) {
        throw new HTTPException(500, {
          message: 'Azure Storage credentials not configured. Please configure Azure Storage credentials.',
        });
      }
      throw new HTTPException(500, {
        message: `Failed to upload file to Azure: ${error.message}`,
      });
    }
    
    throw new HTTPException(500, {
      message: 'Failed to upload file to Azure: Unknown error',
    });
  }
}

/**
 * Upload import file buffer to Azure Blob Storage
 * This is specifically for import files and stores them in 'importfiles' folder organized by month
 * Structure: importfiles/MMM-YYYY/filename.ext (e.g., importfiles/FEB-2026/products_20240219.xlsx)
 */
export async function uploadImportFileToAzure(
  fileBuffer: ArrayBuffer,
  fileName: string,
  importType: ImportType
): Promise<string> {
  try {
    const blobServiceClient = getBlobServiceClient();
    const containerName = getContainerName();

    // Ensure container exists
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    // Get current date and format month folder (e.g., "FEB-2026")
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthFolder = `${monthNames[now.getMonth()]}-${now.getFullYear()}`;

    // Generate unique blob name with timestamp
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().substring(0, 8)
      : Math.random().toString(36).substring(2, 10);

    // Sanitize original filename (remove extension and special chars, keep it readable)
    const baseFileName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const sanitizedBaseName = baseFileName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Construct blob path: importfiles/MMM-YYYY/originalname_timestamp_id.ext
    const blobName = `importfiles/${monthFolder}/${sanitizedBaseName}_${timestamp}_${uniqueId}${fileExtension}`;

    // Get blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Determine content type based on file extension
    let contentType = 'application/octet-stream';
    if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (fileExtension === '.csv') {
      contentType = 'text/csv';
    }

    // Upload file to Azure
    await blockBlobClient.uploadData(new Uint8Array(fileBuffer), {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: getCacheControl(),
        blobContentDisposition: `attachment; filename="${fileName}"`,
      },
    });

    // Generate SAS URL for accessing the file (valid for 1 year by default)
    const blobUrl = generateBlobSASUrl(containerName, blobName);

    console.log(`[Azure Upload] Import file uploaded successfully: ${blobName}`);
    return blobUrl;
  } catch (error) {
    console.error('[Azure Upload] Error uploading import file:', error);

    if (error instanceof Error) {
      if (error.message.includes('credentials')) {
        throw new HTTPException(500, {
          message: 'Azure Storage credentials not configured. Please configure Azure Storage credentials.',
        });
      }
      throw new HTTPException(500, {
        message: `Failed to upload import file to Azure: ${error.message}`,
      });
    }

    throw new HTTPException(500, {
      message: 'Failed to upload import file to Azure: Unknown error',
    });
  }
}
