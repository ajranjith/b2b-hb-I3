# Product Images Upload - Quick Setup Guide

## 📁 Folder Structure

Your image files should be organized like this:

```
hb_backend/api/
├── product-images/           # Default folder (or use custom path)
│   ├── ABC123.jpg           # Product code: ABC123
│   ├── LR175-001.png        # Product code: LR175-001
│   ├── BRAKE-PAD-500.jpg    # Product code: BRAKE-PAD-500
│   └── ...5900 more images
├── src/
│   └── scripts/
│       └── uploadProductImages.ts
└── package.json
```

## 🔧 Environment Setup

Make sure your `.env` file has Azure credentials:

```env
# Azure Blob Storage Configuration
AZURE_ACCOUNT_NAME=your_storage_account_name
AZURE_ACCOUNT_KEY=your_storage_account_key
AZURE_CONTAINER=your_container_name
AZURE_SSL=true
AZURE_CACHE_CONTROL=public,max-age=31536000,immutable
```

## 🚀 Running the Script

### First time (new images):
```bash
cd api
npm run script:upload-images ./product-images
```

### Subsequent runs (new batch of images):
```bash
# Just add new images to the same folder and run again
npm run script:upload-images ./product-images
```

The script will:
- ✅ Upload only NEW images
- ⏭️  Skip images that already exist in database
- 📊 Show progress and statistics
- ❌ Report any errors

## 📝 Image Naming Rules

**IMPORTANT:** Image filename (without extension) = Product Code

✅ **Correct:**
- `ABC123.jpg` → productCode = `ABC123`
- `LR175-001.png` → productCode = `LR175-001`
- `PART_12345.jpg` → productCode = `PART_12345`

❌ **Incorrect:**
- `Product ABC123.jpg` → Will use "Product ABC123" as code
- `abc123 - brake pad.jpg` → Will use "abc123 - brake pad" as code

## 🔄 Workflow for New Images

When you receive a new batch of images:

1. **Copy images** to the `product-images` folder (or your custom folder)
   - Old images can stay in the folder (they'll be skipped)
   - Or use a separate folder for new images only

2. **Run the script**:
   ```bash
   npm run script:upload-images ./product-images
   ```

3. **Check the output**:
   - ✅ Successfully uploaded: X
   - ⏭️  Skipped (already exists): Y
   - ❌ Failed: Z

4. **Fix any errors** (if Z > 0):
   - Check the error messages
   - Fix the problematic image files
   - Re-run the script

## 💡 Tips

### Processing large batches (5000+ images)
- The script uploads images **sequentially** with 500ms delay between each
- Expected time: ~1-1.5 seconds per image (including delay)
- For 5900 images: ~2-2.5 hours
- **Why sequential?** Prevents Azure rate limiting and authentication errors

### Handling different folders
```bash
# Process images from different folders
npm run script:upload-images /path/to/batch1
npm run script:upload-images /path/to/batch2
```

### Re-uploading specific images
If you need to re-upload an image:
1. Delete the ProductImages record from database (or set status=false)
2. Run the script again

### Monitoring progress
The script outputs progress every batch:
```
📦 Processing batch 150/590 (10 images):
  ✅ Uploaded: ABC123
  ⏭️  Skipped: LR175 (already has image)
  ...

📊 Progress: 1500/5900 (25%)
   ✅ Uploaded: 1200 | ⏭️  Skipped: 300 | ❌ Failed: 0
```

## 🐛 Troubleshooting

### Script fails with "Azure credentials not configured"
→ Check `.env` file has `AZURE_ACCOUNT_NAME` and `AZURE_ACCOUNT_KEY`

### Script says "Images folder not found"
→ Check folder path is correct relative to the `api` directory

### Images uploaded but not showing in admin
→ Clear browser cache or check ProductImages table in database

### Some images fail to upload
→ Check error messages in the output
→ Verify image files are not corrupted
→ Ensure product codes don't have special characters

## 📞 Need Help?

For detailed documentation, see: `src/scripts/README_PRODUCT_IMAGES.md`
