import { typesenseClient, PRODUCTS_COLLECTION_SCHEMA, SYNC_BATCH_SIZE } from '@/lib/typesense';
import { prisma } from '@/lib/prisma';

interface SyncResult {
  success: boolean;
  totalProducts: number;
  totalSuperseded: number;
  newCollection: string;
  oldCollection?: string;
  durationMs: number;
  error?: string;
}

interface SyncProgress {
  stage: 'loading_superseded' | 'syncing_products' | 'updating_alias' | 'cleanup' | 'completed' | 'failed';
  supersededLoaded: number;
  productsProcessed: number;
  totalProducts: number;
  message: string;
}

/**
 * Blue-Green Deployment Sync to TypeSense
 *
 * This approach provides zero-downtime sync by:
 * 1. Creating a new collection with timestamp
 * 2. Syncing all data to the new collection
 * 3. Updating the alias to point to the new collection
 * 4. Deleting the old collection
 *
 * Users always query via alias, so switching is instant with no downtime.
 */
export async function syncProductsToTypesense(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  let newCollection = '';
  let oldCollection: string | undefined;
  let totalProducts = 0;
  let totalSuperseded = 0;

  try {
    // Generate new collection name with timestamp
    newCollection = `products_${Date.now()}`;

    console.log(`[TypeSense Sync] Starting Blue-Green sync to collection: ${newCollection}`);

    // Step 1: Check if alias exists and get current collection
    try {
      const aliasInfo = await typesenseClient.aliases('products').retrieve();
      oldCollection = aliasInfo.collection_name;
      console.log(`[TypeSense Sync] Found existing collection via alias: ${oldCollection}`);
    } catch (error) {
      console.log('[TypeSense Sync] No existing alias found (first sync)');
    }

    // Step 2: Create new collection
    console.log(`[TypeSense Sync] Creating new collection: ${newCollection}`);
    await typesenseClient.collections().create({
      ...PRODUCTS_COLLECTION_SCHEMA,
      name: newCollection,
    });

    // Step 3: Load superseded mappings
    console.log('[TypeSense Sync] Loading superseded mappings...');
    onProgress?.({
      stage: 'loading_superseded',
      supersededLoaded: 0,
      productsProcessed: 0,
      totalProducts: 0,
      message: 'Loading superseded product mappings...',
    });

    const supersededMap = new Map<string, string>();
    let supersededCursor = 0;

    while (true) {
      const mappings = await prisma.productSupersededMapping.findMany({
        where: { status: true },
        take: 10000,
        skip: supersededCursor > 0 ? 1 : 0,
        cursor: supersededCursor > 0 ? { id: supersededCursor } : undefined,
        orderBy: { id: 'asc' },
      });

      if (mappings.length === 0) break;

      for (const mapping of mappings) {
        supersededMap.set(mapping.productCode, mapping.supersededBy);
      }

      supersededCursor = mappings[mappings.length - 1]!.id;
      totalSuperseded = supersededMap.size;

      onProgress?.({
        stage: 'loading_superseded',
        supersededLoaded: totalSuperseded,
        productsProcessed: 0,
        totalProducts: 0,
        message: `Loaded ${totalSuperseded.toLocaleString()} superseded mappings...`,
      });

      console.log(`[TypeSense Sync] Loaded ${totalSuperseded} superseded mappings...`);

      if (mappings.length < 10000) break;
    }

    console.log(`[TypeSense Sync] Total superseded mappings loaded: ${totalSuperseded}`);

    // Step 3.5: Load product images
    console.log('[TypeSense Sync] Loading product images...');
    const imageMap = new Map<string, string>();
    let imageCursor = 0;
    let totalImages = 0;

    while (true) {
      const images = await prisma.productImages.findMany({
        where: { status: true },
        take: 10000,
        skip: imageCursor > 0 ? 1 : 0,
        cursor: imageCursor > 0 ? { id: imageCursor } : undefined,
        orderBy: { id: 'asc' },
      });

      if (images.length === 0) break;

      for (const img of images) {
        // Use latest image if multiple exist for same product
        if (!imageMap.has(img.productCode)) {
          imageMap.set(img.productCode, img.image);
          totalImages++;
        }
      }

      imageCursor = images[images.length - 1]!.id;
      console.log(`[TypeSense Sync] Loaded ${totalImages} product images...`);

      if (images.length < 10000) break;
    }

    console.log(`[TypeSense Sync] Total product images loaded: ${totalImages}`);

    // Step 4: Get total product count for progress tracking
    const totalCount = await prisma.product.count({
      where: { status: true },
    });

    console.log(`[TypeSense Sync] Total products to sync: ${totalCount}`);

    // Step 5: Sync products in batches
    console.log('[TypeSense Sync] Starting product sync...');
    onProgress?.({
      stage: 'syncing_products',
      supersededLoaded: totalSuperseded,
      productsProcessed: 0,
      totalProducts: totalCount,
      message: `Syncing 0 / ${totalCount.toLocaleString()} products...`,
    });

    let cursor = 0;

    while (true) {
      const products = await prisma.product.findMany({
        where: { status: true },
        include: {
          prices: {
            where: { status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          stocks: {
            where: { status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        take: SYNC_BATCH_SIZE,
        skip: cursor > 0 ? 1 : 0,
        cursor: cursor > 0 ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
      });

      if (products.length === 0) break;

      console.log('products', products);

      // Prepare documents for this batch
      const documents = products.map((product) => {
        const price = product.prices[0];
        const stock = product.stocks[0];

        return {
          id: String(product.code), // Ensure string type
          code: String(product.code), // Ensure string type
          name: product.name,
          type: product.type,
          supplierCode: product.supplierCode || '',
          stock: stock?.stock ?? 0, // Use ?? to preserve negative values
          currency: price?.currency || 'GBP',
          net1: price?.net1 ? Number(price.net1) : 0,
          net2: price?.net2 ? Number(price.net2) : 0,
          net3: price?.net3 ? Number(price.net3) : 0,
          net4: price?.net4 ? Number(price.net4) : 0,
          net5: price?.net5 ? Number(price.net5) : 0,
          net6: price?.net6 ? Number(price.net6) : 0,
          net7: price?.net7 ? Number(price.net7) : 0,
          height: product.height ? Number(product.height) : undefined,
          length: product.length ? Number(product.length) : undefined,
          width: product.width ? Number(product.width) : undefined,
          weight: product.weight ? Number(product.weight) : undefined,
          createdAt: Math.floor(product.createdAt.getTime() / 1000),
          updatedAt: Math.floor(product.updatedAt.getTime() / 1000),
          image: imageMap.get(product.code) || '',
          supersededBy: supersededMap.get(product.code) || '',
        };
      });

      // Import batch to TypeSense
      await typesenseClient
        .collections(newCollection)
        .documents()
        .import(documents, { action: 'create' });

      totalProducts += documents.length;
      cursor = products[products.length - 1]!.id;

      onProgress?.({
        stage: 'syncing_products',
        supersededLoaded: totalSuperseded,
        productsProcessed: totalProducts,
        totalProducts: totalCount,
        message: `Syncing ${totalProducts.toLocaleString()} / ${totalCount.toLocaleString()} products...`,
      });

      console.log(`[TypeSense Sync] Synced ${totalProducts} / ${totalCount} products...`);

      if (products.length < SYNC_BATCH_SIZE) break;
    }

    console.log(`[TypeSense Sync] Total products synced: ${totalProducts}`);

    // Step 6: Update alias to point to new collection
    console.log(`[TypeSense Sync] Updating alias 'products' to point to ${newCollection}...`);
    onProgress?.({
      stage: 'updating_alias',
      supersededLoaded: totalSuperseded,
      productsProcessed: totalProducts,
      totalProducts: totalCount,
      message: 'Switching to new collection (zero downtime)...',
    });

    await typesenseClient.aliases().upsert('products', {
      collection_name: newCollection,
    });

    console.log('[TypeSense Sync] Alias updated successfully');

    // Step 7: Delete old collection (if exists)
    if (oldCollection) {
      console.log(`[TypeSense Sync] Deleting old collection: ${oldCollection}...`);
      onProgress?.({
        stage: 'cleanup',
        supersededLoaded: totalSuperseded,
        productsProcessed: totalProducts,
        totalProducts: totalCount,
        message: 'Cleaning up old collection...',
      });

      try {
        await typesenseClient.collections(oldCollection).delete();
        console.log('[TypeSense Sync] Old collection deleted');
      } catch (error) {
        console.warn('[TypeSense Sync] Failed to delete old collection (may not exist):', error);
      }
    }

    const durationMs = Date.now() - startTime;
    const durationMinutes = (durationMs / 1000 / 60).toFixed(2);

    console.log(`[TypeSense Sync] ✅ Sync completed in ${durationMinutes} minutes`);
    console.log(`[TypeSense Sync] - Products synced: ${totalProducts.toLocaleString()}`);
    console.log(`[TypeSense Sync] - Superseded mappings: ${totalSuperseded.toLocaleString()}`);
    console.log(`[TypeSense Sync] - New collection: ${newCollection}`);
    console.log(`[TypeSense Sync] - Old collection: ${oldCollection || 'none'}`);

    onProgress?.({
      stage: 'completed',
      supersededLoaded: totalSuperseded,
      productsProcessed: totalProducts,
      totalProducts: totalCount,
      message: `Sync completed! ${totalProducts.toLocaleString()} products synced in ${durationMinutes} minutes.`,
    });

    // Log sync to database
    await prisma.$executeRaw`
      INSERT INTO "SyncLog" (type, "totalRecords", "createdAt", "updatedAt")
      VALUES ('TYPESENSE_PRODUCTS', ${totalProducts}, NOW(), NOW())
    `;

    return {
      success: true,
      totalProducts,
      totalSuperseded,
      newCollection,
      oldCollection,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[TypeSense Sync] ❌ Sync failed:', error);

    onProgress?.({
      stage: 'failed',
      supersededLoaded: totalSuperseded,
      productsProcessed: totalProducts,
      totalProducts: 0,
      message: `Sync failed: ${errorMessage}`,
    });

    // Clean up new collection on failure
    if (newCollection) {
      try {
        console.log(`[TypeSense Sync] Cleaning up failed collection: ${newCollection}`);
        await typesenseClient.collections(newCollection).delete();
      } catch (cleanupError) {
        console.warn('[TypeSense Sync] Failed to clean up new collection:', cleanupError);
      }
    }

    return {
      success: false,
      totalProducts,
      totalSuperseded,
      newCollection,
      oldCollection,
      durationMs,
      error: errorMessage,
    };
  }
}
