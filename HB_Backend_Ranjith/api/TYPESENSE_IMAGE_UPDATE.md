# TypeSense Product Images Integration

## ✅ Changes Made

### 1. **TypeSense Schema Updated**
Added `image` field to the products collection schema:
```typescript
{ name: 'image', type: 'string' as const, optional: true }
```
- Location: `src/lib/typesense.ts`
- Field is optional (not all products may have images)

### 2. **Sync Logic Updated**
The TypeSense sync service now:
- Loads all product images from `ProductImages` table
- Maps images to products by `productCode`
- Includes image URLs in synced documents

**Changes in** `src/services/typesenseSync.ts`:
- Loads product images before syncing products
- Creates imageMap: `productCode` → `imageUrl`
- Includes `image` field in each product document

### 3. **API Response Updated**
Product search API now returns image URLs:
```json
{
  "id": "ABC123",
  "code": "ABC123",
  "name": "Brake Pad",
  "image": "https://azure.url/image.jpg",  // NEW!
  ...
}
```

**Endpoints affected:**
- `GET /api/v1/products` (search with TypeSense)
- `GET /api/v1/products/admin` (already had images)
- `GET /api/v1/products/:id` (already had images)

## 🔄 When Images Are Synced

### Automatic Sync:
1. **After Product Import**
   - Product imports automatically trigger TypeSense sync
   - All product images are included in the sync
   - ✅ No manual action needed

### Manual Sync Required:
2. **After Image Upload**
   - Upload images using the script: `npm run script:upload-images`
   - Then trigger manual sync:
     ```bash
     curl -X POST http://localhost:3000/api/v1/sync/typesense \
       -H "Cookie: token=YOUR_TOKEN"
     ```
   - Or use admin UI to trigger sync

## 📋 Complete Workflow

### Scenario 1: Import Products First, Then Images
```bash
# 1. Import products via admin UI
#    → Auto-syncs to TypeSense (without images)

# 2. Upload product images
npm run script:upload-images "/path/to/images"

# 3. Manually sync to TypeSense to include images
curl -X POST http://localhost:3000/api/v1/sync/typesense \
  -H "Cookie: token=YOUR_TOKEN"
```

### Scenario 2: Upload Images First, Then Import Products
```bash
# 1. Upload product images
npm run script:upload-images "/path/to/images"

# 2. Import products via admin UI
#    → Auto-syncs to TypeSense (images included automatically!)
```

### Scenario 3: Add New Images to Existing Products
```bash
# 1. Upload new product images
npm run script:upload-images "/path/to/new/images"

# 2. Manually sync to TypeSense
curl -X POST http://localhost:3000/api/v1/sync/typesense \
  -H "Cookie: token=YOUR_TOKEN"
```

## 🔍 How Sync Works

The sync process:
1. **Loads superseded mappings** (~1-2 seconds)
2. **Loads product images** (~1-2 seconds for 5900 images)
3. **Syncs products** in batches of 10,000
4. **Creates new collection** with timestamp
5. **Updates alias** to point to new collection (zero downtime!)
6. **Deletes old collection**

**Performance:**
- ~700,000 products: 6-10 minutes
- ~5,900 images: +1-2 seconds overhead
- Zero downtime during sync

## 🎯 Important Notes

### Image Matching:
- Images are matched by `productCode`
- If multiple images exist for same product, uses latest (by createdAt)
- If no image exists, field is empty string `""`

### TypeSense Collection:
- New field is optional, so existing collections continue to work
- Next sync will create new collection with image field
- Blue-green deployment ensures zero downtime

### API Compatibility:
- Frontend can now access `image` field in search results
- Field is optional, so check for empty string: `if (product.image)`
- URLs are Azure SAS URLs (valid for 1 year)

## 🚀 Deployment Steps

### First Time Setup:
1. **Run migration** (already done):
   ```bash
   npx prisma migrate deploy
   ```

2. **Upload images**:
   ```bash
   npm run script:upload-images "/path/to/images"
   ```

3. **Trigger sync** to update TypeSense:
   ```bash
   curl -X POST http://localhost:3000/api/v1/sync/typesense \
     -H "Cookie: token=YOUR_TOKEN"
   ```

4. **Verify** images appear in product search results

### Ongoing:
- **Daily product imports** → Auto-sync (images included)
- **New image uploads** → Manual sync required
- **Scheduled sync** → Can run nightly via cron if needed

## 📊 Monitoring

Check sync status in server logs:
```
[TypeSense Sync] Loading product images...
[TypeSense Sync] Loaded 5900 product images...
[TypeSense Sync] Total product images loaded: 5900
[TypeSense Sync] Syncing products...
[TypeSense Sync] ✅ Sync completed in 6.24 minutes
```

## 🔧 Troubleshooting

### Images not showing after sync:
1. Check ProductImages table has records
2. Verify productCodes match between Product and ProductImages
3. Check TypeSense collection has image field
4. Re-run sync if needed

### Sync takes too long:
- Normal: 6-10 minutes for 700k products
- Image loading adds ~1-2 seconds (negligible)
- If slower, check database performance

### Old images not updating:
- Upload new images (will overwrite or create new records)
- Run manual sync to update TypeSense
- New images will appear in search results

## ✨ Summary

All done! Product images are now:
- ✅ Stored in database (ProductImages table)
- ✅ Synced to TypeSense (searchable)
- ✅ Returned in API responses
- ✅ Auto-synced after product imports
- ✅ Ready for frontend display

**Next step:** Update frontend to display product images from search results!
