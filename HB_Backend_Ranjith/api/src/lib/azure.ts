import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

/**
 * Azure Blob Storage client configuration
 */
const azureAccountName = process.env.AZURE_ACCOUNT_NAME;
const azureAccountKey = process.env.AZURE_ACCOUNT_KEY;
const azureContainer = process.env.AZURE_CONTAINER || 'dev';
const azureSSL = process.env.AZURE_SSL === 'True' || process.env.AZURE_SSL === 'true';
const azureConnectionTimeout = parseInt(process.env.AZURE_CONNECTION_TIMEOUT_SECS || '30', 10);
const azureOverwriteFiles = process.env.AZURE_OVERWRITE_FILES === 'True' || process.env.AZURE_OVERWRITE_FILES === 'true';
const azureCacheControl = process.env.AZURE_CACHE_CONTROL || 'public,max-age=31536000,immutable';

if (!azureAccountName || !azureAccountKey) {
  console.warn('[Azure] Azure Storage credentials not configured. File uploads will fail.');
}

let blobServiceClient: BlobServiceClient | null = null;

/**
 * Get Azure Blob Service Client
 */
export function getBlobServiceClient(): BlobServiceClient {
  if (blobServiceClient) {
    return blobServiceClient;
  }

  if (!azureAccountName || !azureAccountKey) {
    throw new Error('Azure Storage credentials not configured. Please set AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY');
  }

  // Use account name and key with StorageSharedKeyCredential
  const protocol = azureSSL ? 'https' : 'http';
  const accountUrl = `${protocol}://${azureAccountName}.blob.core.windows.net`;
  const credential = new StorageSharedKeyCredential(azureAccountName, azureAccountKey);
  
  blobServiceClient = new BlobServiceClient(accountUrl, credential);

  return blobServiceClient;
}

/**
 * Get container name
 */
export function getContainerName(): string {
  return azureContainer;
}

/**
 * Get cache control header
 */
export function getCacheControl(): string {
  return azureCacheControl;
}

/**
 * Check if files should be overwritten
 */
export function shouldOverwriteFiles(): boolean {
  return azureOverwriteFiles;
}

/**
 * Get connection timeout
 */
export function getConnectionTimeout(): number {
  return azureConnectionTimeout;
}

/**
 * Get Azure account name
 */
export function getAccountName(): string {
  if (!azureAccountName) {
    throw new Error('Azure account name not configured');
  }
  return azureAccountName;
}

/**
 * Get Azure account key
 */
export function getAccountKey(): string {
  if (!azureAccountKey) {
    throw new Error('Azure account key not configured');
  }
  return azureAccountKey;
}

/**
 * Generate SAS URL for blob access
 */
export function generateBlobSASUrl(containerName: string, blobName: string, expiresInMinutes: number = 60 * 24 * 365): string {
  const accountName = getAccountName();
  const accountKey = getAccountKey();
  const protocol = azureSSL ? 'https' : 'http';
  
  const sasOptions = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'), // Read permission
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + expiresInMinutes * 60 * 1000),
  };

  const sasToken = generateBlobSASQueryParameters(
    sasOptions,
    new StorageSharedKeyCredential(accountName, accountKey)
  ).toString();

  return `${protocol}://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}
