import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { uploadFileToAzure } from './_service';
import { validateFile } from '@/utils/fileUpload';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

const azureRoutes = new Hono();

/**
 * Helper function to extract files from form data (supports single or multiple files)
 */
async function extractFilesFromFormData(c: Context): Promise<File[]> {
  const formData = await c.req.formData();
  
  // Try to get multiple files first (for 'files' field)
  const filesField = formData.getAll('files');
  if (filesField.length > 0) {
    const files: File[] = [];
    for (const file of filesField) {
      if (typeof file === 'string') {
        throw new HTTPException(400, { message: 'Invalid file upload. Make sure you are sending files, not text.' });
      }
      if (typeof file !== 'object' || file === null) {
        throw new HTTPException(400, {
          message: `Invalid file format. Expected object, received: ${typeof file}`,
        });
      }
      if (!('name' in file && 'size' in file && 'arrayBuffer' in file)) {
        throw new HTTPException(400, {
          message: `Invalid file format. Missing required properties (name, size, or arrayBuffer).`,
        });
      }
      files.push(file as File);
    }
    return files;
  }
  
  // Fallback to single file (for 'file' field - backward compatibility)
  const singleFile = formData.get('file');
  if (!singleFile) {
    throw new HTTPException(400, { message: 'No file(s) provided in form data. Use "file" for single upload or "files" for multiple uploads.' });
  }
  
  if (typeof singleFile === 'string') {
    throw new HTTPException(400, { message: 'Invalid file upload. Make sure you are sending a file, not text.' });
  }
  
  if (typeof singleFile !== 'object' || singleFile === null) {
    throw new HTTPException(400, {
      message: `Invalid file format. Expected object, received: ${typeof singleFile}`,
    });
  }
  
  if (!('name' in singleFile && 'size' in singleFile && 'arrayBuffer' in singleFile)) {
    throw new HTTPException(400, {
      message: `Invalid file format. Missing required properties (name, size, or arrayBuffer).`,
    });
  }
  
  return [singleFile as File];
}

// Upload file(s) to Azure
azureRoutes.post(
  '/upload',
  authenticate,
  describeRoute({
    tags: ['Azure'],
    summary: 'Upload file(s) to Azure Blob Storage',
    description: `Upload one or multiple files to Azure Blob Storage and get URLs to access/download them.

**Features:**
- Upload any file type (images, documents, PDFs, etc.)
- Supports single file upload (use "file" field) or multiple files (use "files" field)
- Returns URLs for accessing/downloading the files
- Files are stored with unique names to prevent conflicts
- Maximum file size per file: 100MB (configurable)
- Viewable files (images, PDFs) display in browser; others download

**Single File Upload:**
\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "file=@/path/to/file.jpg" \\
  http://localhost:3000/api/v1/azure/upload
\`\`\`

**Multiple Files Upload:**
\`\`\`bash
curl -X POST \\
  -H "Cookie: token=YOUR_TOKEN" \\
  -F "files=@/path/to/file1.jpg" \\
  -F "files=@/path/to/file2.pdf" \\
  -F "files=@/path/to/file3.png" \\
  http://localhost:3000/api/v1/azure/upload
\`\`\`

**Note:** File uploads don't work well in the Scalar "Try it" interface. Use curl or Postman instead.`,
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                description: 'Single file to upload (for backward compatibility)',
              },
              files: {
                type: 'array',
                items: {
                  type: 'string',
                  format: 'binary',
                },
                description: 'Multiple files to upload',
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'File(s) uploaded successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    url: z.string().url(),
                    fileName: z.string(),
                    fileSize: z.number(),
                  })
                ),
              })
            ),
          },
        },
      },
      400: {
        description: 'Invalid file(s) or validation error',
      },
      401: {
        description: 'Authentication required',
      },
      500: {
        description: 'Azure upload failed or credentials not configured',
      },
    },
  }),
  async (c) => {
    // Extract files (supports both single and multiple)
    const uploadedFiles = await extractFilesFromFormData(c);
    
    if (uploadedFiles.length === 0) {
      throw new HTTPException(400, { message: 'No files provided' });
    }

    // Validate and upload each file
    const uploadResults = await Promise.all(
      uploadedFiles.map(async (file) => {
        // Validate file (allow all file types, max 100MB per file)
        validateFile(file, {
          maxSizeBytes: 100 * 1024 * 1024, // 100MB per file
          allowedExtensions: undefined,
          allowedMimeTypes: undefined,
        });

        // Upload to Azure
        const fileUrl = await uploadFileToAzure(file);

        return {
          url: fileUrl,
          fileName: file.name,
          fileSize: file.size,
        };
      })
    );

    return c.json({
      success: true,
      data: uploadResults,
    });
  }
);

export default azureRoutes;
