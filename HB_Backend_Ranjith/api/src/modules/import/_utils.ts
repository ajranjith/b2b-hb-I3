import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ImportType } from 'generated/prisma';
import { uploadImportFileToAzure } from '../azure/_service';


/**
 * Helper function to extract and validate file from form data
 */

export async function extractFileFromFormData(c: Context): Promise<File> {
    const formData = await c.req.formData();
    const file = formData.get('file');
  
    // Validate that file was provided
    if (!file) {
      throw new HTTPException(400, { message: 'No file provided in form data' });
    }
  
    // Check if it's a string (incorrect form data type)
    if (typeof file === 'string') {
      throw new HTTPException(400, { message: 'Invalid file upload. Make sure you are sending a file, not text.' });
    }
  
    // Check if it's an object (required for 'in' operator)
    if (typeof file !== 'object' || file === null) {
      throw new HTTPException(400, {
        message: `Invalid file format. Expected object, received: ${typeof file}`,
      });
    }
  
    // Check if file has required properties (File or Blob in Bun)
    if (!('name' in file && 'size' in file && 'arrayBuffer' in file)) {
      throw new HTTPException(400, {
        message: `Invalid file format. Missing required properties (name, size, or arrayBuffer).`,
      });
    }
  
    // Type assertion for TypeScript (we've validated it has File properties)
    return file as File;
  }

/**
 * Upload import file to Azure and return the file URL
 * This should be called after successful file validation and before/during import processing
 */
export async function uploadAndSaveImportFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
  importType: ImportType
): Promise<string | null> {
  try {
    const fileUrl = await uploadImportFileToAzure(fileBuffer, fileName, importType);
    console.log(`[Import] File uploaded to Azure: ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    // Log the error but don't fail the import if Azure upload fails
    // The import can continue without the file URL
    console.error('[Import] Failed to upload file to Azure:', error);
    return null;
  }
}