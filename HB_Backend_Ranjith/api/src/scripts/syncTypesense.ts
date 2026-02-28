import { syncProductsToTypesense } from '@/services/typesenseSync';

console.log('Starting Typesense full sync...');

const result = await syncProductsToTypesense((progress) => {
  console.log(`[${progress.stage}] ${progress.message}`);
});

if (result.success) {
  console.log(`Sync completed in ${(result.durationMs / 1000).toFixed(1)}s — ${result.totalProducts} products indexed.`);
  process.exit(0);
} else {
  console.error(`Sync failed: ${result.error}`);
  process.exit(1);
}
