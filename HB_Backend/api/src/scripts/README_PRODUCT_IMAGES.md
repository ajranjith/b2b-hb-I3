# Product Images Upload Script

This script uploads product images to Azure Blob Storage and creates corresponding `ProductImages` records in the database.

## Features

- ✅ Uploads images to Azure Blob Storage
- ✅ Creates ProductImages records with image URLs
- ✅ **Skips images that are already uploaded** (checks by productCode)
- ✅ Processes images in batches for better performance
- ✅ Supports multiple image formats (JPG, PNG, GIF, WebP, SVG)
- ✅ Provides detailed progress tracking and statistics
- ✅ Can be run multiple times safely (idempotent)
- ✅ Error handling with detailed error reports

## Prerequisites

1. **Azure Blob Storage credentials** must be configured in your `.env` file:
   ```env
   AZURE_ACCOUNT_NAME=your_account_name
   AZURE_ACCOUNT_KEY=your_account_key
   AZURE_CONTAINER=your_container_name
   AZURE_SSL=true
   ```

2. **Image files** must be named with the product code (without extension)
   - Example: `ABC123.jpg` → productCode = `ABC123`
   - Example: `LR175-001.png` → productCode = `LR175-001`

## Usage

### Method 1: Using npm script

```bash
# Run with default folder (./product-images)
npm run script:upload-images

# Run with custom folder path
npm run script:upload-images /path/to/your/images/folder
```

### Method 2: Using tsx directly

```bash
# From the api directory
cd api

# Run with default folder
npx tsx src/scripts/uploadProductImages.ts

# Run with custom folder path
npx tsx src/scripts/uploadProductImages.ts /path/to/your/images/folder
```

### Method 3: Environment variable

You can also set the `IMAGES_FOLDER` environment variable:

```bash
export IMAGES_FOLDER=/path/to/your/images/folder
npm run script:upload-images
```

## Configuration

You can modify these settings in the script:

- **IMAGES_FOLDER**: Default folder path (default: `./product-images`)
- **BATCH_SIZE**: Number of images per batch for progress tracking (default: `10`)
- **UPLOAD_DELAY_MS**: Delay between each upload in milliseconds (default: `500ms`)
  - Prevents Azure rate limiting and authentication errors
  - Increase if you experience timeouts, decrease for faster uploads
- **ALLOWED_EXTENSIONS**: Supported image formats (default: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`)

## How It Works

1. **Scans folder**: Reads all image files from the specified folder
2. **Extracts product code**: Uses filename (without extension) as productCode
3. **Checks existing**: Queries database to see if productCode already has an image
4. **Skips if exists**: If image already exists, skips to next file
5. **Uploads to Azure**: Uploads new images to Azure Blob Storage in `products/` folder
   - **Sequential uploads** with 500ms delay between each to prevent rate limiting
   - Prevents Azure authentication errors and timeouts
6. **Creates record**: Creates ProductImages record with generated Azure URL
7. **Reports stats**: Shows detailed statistics and any errors

## Example Output

```
🚀 Starting Product Images Upload Script
📁 Images folder: /path/to/images
📦 Batch size: 10

🔍 Scanning for image files...
📊 Found 5900 image files

📦 Processing batch 1/590 (10 images):
  📤 Uploading: ABC123...
  ✅ Uploaded: ABC123
  ⏭️  Skipped: LR175 (already has image)
  📤 Uploading: XYZ789...
  ✅ Uploaded: XYZ789
  ...

📊 Progress: 10/5900 (0%)
   ✅ Uploaded: 8 | ⏭️  Skipped: 2 | ❌ Failed: 0

...

============================================================
📊 FINAL SUMMARY
============================================================
Total files processed: 5900
✅ Successfully uploaded: 5500
⏭️  Skipped (already exists): 350
❌ Failed: 50

⚠️  ERRORS:
  1. INVALID-CODE.jpg
     Error: Failed to upload to Azure: Network error
  2. CORRUPT-FILE.png
     Error: Invalid image file
============================================================

✨ Script completed successfully
```

## Error Handling

The script handles various error scenarios:

- **Missing folder**: Throws error if folder doesn't exist
- **Azure connection errors**: Catches and reports upload failures
- **Database errors**: Catches and reports record creation failures
- **Invalid files**: Skips files that can't be processed

## Running on New Image Batches

When you receive new images:

1. **Place new images** in your folder (can mix with old images)
2. **Run the script** - it will automatically skip images that already exist
3. **Review the summary** - check uploaded, skipped, and failed counts
4. **Fix any errors** - re-run the script after fixing issues

## Tips

- **Large batches**: For thousands of images, consider running overnight
- **Network issues**: If uploads fail, re-run the script - it will resume from where it left off
- **Duplicate handling**: The script uses the latest image if you upload multiple times for the same productCode
- **Monitoring**: Watch the progress output to ensure uploads are proceeding smoothly

## Troubleshooting

### "Azure Storage credentials not configured"
- Check your `.env` file has correct Azure credentials
- Ensure `AZURE_ACCOUNT_NAME` and `AZURE_ACCOUNT_KEY` are set

### "Images folder not found"
- Check the folder path is correct
- Use absolute path or relative path from the `api` directory

### "Failed to upload to Azure"
- Check your network connection
- Verify Azure credentials are valid
- Check container permissions

### Images uploaded but not visible in app
- Check that ProductImages records were created in database
- Verify the image URLs are accessible
- Check that product codes match between images and products

## Support

For issues or questions, contact the development team.
