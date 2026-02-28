import { typesenseClient } from '@/lib/typesense';
import { prisma } from '@/lib/prisma';

interface SupersededSyncResult {
  success: boolean;
  affectedProducts: number;
  durationMs: number;
  error?: string;
}

/**
 * Incremental sync of superseded mappings to TypeSense
 *
 * This is much faster than full Blue-Green sync because:
 * - Only updates affected products (not all 700k)
 * - Only updates one field (supersededBy)
 * - Uses TypeSense's bulk update API
 *
 * Typically completes in 5-20 seconds for 1000 products
 */
export async function syncSupersededToTypesense(
  affectedProductCodes: Set<string>
): Promise<SupersededSyncResult> {
  const startTime = Date.now();

  try {
    console.log(`[Superseded Sync] Starting incremental sync for ${affectedProductCodes.size} products...`);

    if (affectedProductCodes.size === 0) {
      console.log('[Superseded Sync] No products affected, skipping sync');
      return {
        success: true,
        affectedProducts: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 1: Get ALL active superseded mappings (not just affected ones)
    // We need all mappings to properly resolve chains
    const allMappings = await prisma.productSupersededMapping.findMany({
      where: {
        status: true,
      },
      select: {
        productCode: true,
        supersededBy: true,
      },
    });

    console.log(`[Superseded Sync] Found ${allMappings.length} active mappings in database`);

    // Step 2: Build direct superseded map from all mappings
    const directSupersededMap = new Map<string, string>();
    const reverseSupersededMap = new Map<string, Set<string>>(); // Maps supersededBy -> Set of products that supersede to it

    for (const mapping of allMappings) {
      directSupersededMap.set(mapping.productCode, mapping.supersededBy);

      // Build reverse map for finding dependent products
      if (!reverseSupersededMap.has(mapping.supersededBy)) {
        reverseSupersededMap.set(mapping.supersededBy, new Set());
      }
      reverseSupersededMap.get(mapping.supersededBy)!.add(mapping.productCode);
    }

    // Step 2.5: Expand affected products to include all products in related chains
    // If C is affected and A→B→C exists, we need to update A and B as well
    const expandedAffectedProducts = new Set<string>(affectedProductCodes);

    const addDependentProducts = (productCode: string) => {
      // Find all products that directly supersede to this product
      const dependents = reverseSupersededMap.get(productCode);
      if (dependents) {
        for (const dependent of dependents) {
          if (!expandedAffectedProducts.has(dependent)) {
            expandedAffectedProducts.add(dependent);
            // Recursively add products that supersede to this dependent
            addDependentProducts(dependent);
          }
        }
      }
    };

    // For each originally affected product, find all products that depend on it
    for (const productCode of affectedProductCodes) {
      addDependentProducts(productCode);
    }

    console.log(
      `[Superseded Sync] Expanded ${affectedProductCodes.size} affected products to ${expandedAffectedProducts.size} (including chain dependencies)`
    );

    // Step 3: Resolve full superseded chains to find final products
    // For each product, follow the chain to the end
    const resolveSupersededChain = (productCode: string): string => {
      const visited = new Set<string>();
      let current = productCode;
      let next = directSupersededMap.get(current);

      // Follow the chain until we reach the end or detect a cycle
      while (next && !visited.has(current)) {
        visited.add(current);
        current = next;
        next = directSupersededMap.get(current);
      }

      // Return the final product in the chain (or original if no mapping exists)
      return current;
    };

    // Build final superseded map with resolved chains for expanded affected products
    const supersededMap = new Map<string, string>();
    for (const productCode of expandedAffectedProducts) {
      const directSupersededBy = directSupersededMap.get(productCode);
      if (directSupersededBy) {
        // Follow the chain to find the final product
        const finalSupersededBy = resolveSupersededChain(productCode);
        // Only set if the final product is different from the original
        if (finalSupersededBy !== productCode) {
          supersededMap.set(productCode, finalSupersededBy);
        }
      }
    }

    console.log(`[Superseded Sync] Resolved ${supersededMap.size} final superseded mappings`);

    // Step 4: Prepare updates for TypeSense
    const updates = Array.from(expandedAffectedProducts).map((productCode) => ({
      id: productCode,
      supersededBy: supersededMap.get(productCode) || '', // Empty string if archived/removed
    }));

    console.log(`[Superseded Sync] Updating ${updates.length} products in TypeSense...`);

    // Step 5: Bulk update TypeSense (using update action)
    // Note: This only updates the supersededBy field, not the entire document
    const importResults = await typesenseClient
      .collections('products')
      .documents()
      .import(updates, { action: 'update' });

    // Step 6: Check for failures
    const failedUpdates = importResults.filter((result: any) => !result.success);
    if (failedUpdates.length > 0) {
      console.warn(
        `[Superseded Sync] ${failedUpdates.length} products failed to update in TypeSense`,
        failedUpdates.slice(0, 5) // Log first 5 failures
      );
    }

    const successCount = importResults.filter((result: any) => result.success).length;
    const durationMs = Date.now() - startTime;

    console.log(
      `[Superseded Sync] ✅ Updated ${successCount}/${updates.length} products in ${(durationMs / 1000).toFixed(2)}s`
    );

    return {
      success: true,
      affectedProducts: successCount,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[Superseded Sync] ❌ Sync failed:', (error as any).importResults);

    return {
      success: false,
      affectedProducts: 0,
      durationMs,
      error: errorMessage,
    };
  }
}
