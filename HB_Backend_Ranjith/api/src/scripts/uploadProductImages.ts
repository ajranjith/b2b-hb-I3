import { prisma } from '../lib/prisma';
import { getBlobServiceClient, getContainerName, getCacheControl, generateBlobSASUrl } from '../lib/azure';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Configuration
 */
const IMAGES_FOLDER = process.env.IMAGES_FOLDER || './product-images';
const BATCH_SIZE = 10; // Number of images per batch (for progress tracking)
const UPLOAD_DELAY_MS = 500; // Delay between each upload in milliseconds (500ms = 0.5 seconds)
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

/**
 * Statistics tracker
 */
interface Stats {
  total: number;
  skipped: number;
  uploaded: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Sleep utility for adding delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if image already exists for a product code
 */
async function imageExistsForProduct(productCode: string): Promise<boolean> {
  const existingImage = await prisma.productImages.findFirst({
    where: {
      productCode: productCode,
      status: true,
    },
  });
  return !!existingImage;
}

/**
 * Upload image file to Azure Blob Storage
 */
async function uploadImageToAzure(
  filePath: string,
  productCode: string
): Promise<string> {
  const blobServiceClient = getBlobServiceClient();
  const containerName = getContainerName();

  // Ensure container exists
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  // Use product code as blob name (with extension)
  const fileExtension = path.extname(filePath);
  const blobName = `products/${productCode}${fileExtension}`;

  // Debug logging
  console.log(`     → Blob name: ${blobName}`);

  // Get blob client
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  // Determine MIME type
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  const contentType = mimeTypes[fileExtension.toLowerCase()] || 'image/jpeg';

  // Read file buffer (same method as API)
  const fileBuffer = await fs.readFile(filePath);

  // Upload using uploadData (same as API) instead of uploadFile
  await blockBlobClient.uploadData(fileBuffer, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: getCacheControl(),
      blobContentDisposition: `inline; filename="${productCode}${fileExtension}"`,
    },
  });

  // Generate SAS URL (valid for 1 year)
  const blobUrl = generateBlobSASUrl(containerName, blobName);

  return blobUrl;
}

/**
 * Process a single image file
 */
async function processImage(
  filePath: string,
  fileName: string,
  stats: Stats
): Promise<void> {
  // Extract product code from filename (remove extension)
  const rawProductCode = path.parse(fileName).name;

  // Sanitize product code: remove ALL spaces
  const productCode = rawProductCode.replace(/\s+/g, '');

  try {

    // Check if image already exists
    const exists = await imageExistsForProduct(productCode);
    if (exists) {
      console.log(`  ⏭️  Skipped: ${productCode} (already has image)`);
      stats.skipped++;
      return;
    }

    // Get file info for debugging
    const fileStats = await fs.stat(filePath);
    const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);

    // Upload to Azure
    console.log(`  📤 Uploading: ${productCode} (${fileSizeMB}MB)...`);
    const imageUrl = await uploadImageToAzure(filePath, productCode);

    // Create ProductImages record
    await prisma.productImages.create({
      data: {
        productCode: productCode,
        image: imageUrl,
      },
    });

    console.log(`  ✅ Uploaded: ${productCode}`);
    stats.uploaded++;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`  ❌ Failed: ${fileName}`);
    console.error(`     Product Code: ${productCode}`);
    console.error(`     Error: ${errorMsg}`);
    stats.failed++;
    stats.errors.push({
      file: fileName,
      error: errorMsg,
    });
  }
}

/**
 * Get all image files from the folder
 */
async function getImageFiles(folderPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(folderPath);

    // Filter only image files
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });

    return imageFiles;
  } catch (error) {
    throw new Error(`Failed to read images folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main function to upload product images
 */
async function uploadProductImages(folderPath?: string) {
  const imagesFolder = folderPath || IMAGES_FOLDER;

  console.log('🚀 Starting Product Images Upload Script');
  console.log(`📁 Images folder: ${imagesFolder}`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Upload delay: ${UPLOAD_DELAY_MS}ms between each upload\n`);

  const stats: Stats = {
    total: 0,
    skipped: 0,
    uploaded: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Check if folder exists
    try {
      await fs.access(imagesFolder);
    } catch {
      throw new Error(`Images folder not found: ${imagesFolder}`);
    }

    // Get all image files
    console.log('🔍 Scanning for image files...');
    const imageFiles = await getImageFiles(imagesFolder);
    stats.total = imageFiles.length;

    console.log(`📊 Found ${stats.total} image files\n`);

    if (stats.total === 0) {
      console.log('⚠️  No image files found in the folder');
      return;
    }

    // Process images in batches
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(imageFiles.length / BATCH_SIZE);

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} images):`);

      // Process images sequentially with delay to avoid Azure rate limiting
      for (let j = 0; j < batch.length; j++) {
        const fileName = batch[j];
        const filePath = path.join(imagesFolder, fileName);

        // Process the image
        await processImage(filePath, fileName, stats);

        // Add delay between uploads (except for the last image in batch)
        if (j < batch.length - 1) {
          await sleep(UPLOAD_DELAY_MS);
        }
      }

      // Show progress
      const progress = Math.round(((i + batch.length) / stats.total) * 100);
      console.log(`\n📊 Progress: ${i + batch.length}/${stats.total} (${progress}%)`);
      console.log(`   ✅ Uploaded: ${stats.uploaded} | ⏭️  Skipped: ${stats.skipped} | ❌ Failed: ${stats.failed}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total files processed: ${stats.total}`);
    console.log(`✅ Successfully uploaded: ${stats.uploaded}`);
    console.log(`⏭️  Skipped (already exists): ${stats.skipped}`);
    console.log(`❌ Failed: ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      stats.errors.forEach(({ file, error }, index) => {
        console.log(`  ${index + 1}. ${file}`);
        console.log(`     Error: ${error}`);
      });
    }

    console.log('='.repeat(60));

    if (stats.failed > 0) {
      throw new Error(`Script completed with ${stats.failed} failures`);
    }

  } catch (error) {
    console.error('\n❌ Script error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  // Get folder path from command line argument if provided
  const folderPath = process.argv[2];

  uploadProductImages(folderPath)
    .then(() => {
      console.log('\n✨ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

export { uploadProductImages };
