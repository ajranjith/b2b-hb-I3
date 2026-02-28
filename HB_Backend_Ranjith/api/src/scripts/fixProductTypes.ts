import { prisma } from '../lib/prisma';
import { ProductType } from '../../generated/prisma';

/**
 * Fix product type casing issues in the database
 * This script normalizes any incorrect enum values
 */
async function fixProductTypes() {
  console.log('🔍 Checking for products with incorrect type casing...');

  try {
    // Get all products
    const products = await prisma.product.findMany({
      select: { id: true, code: true, type: true },
    });

    console.log(`📊 Found ${products.length} total products`);

    let fixedCount = 0;
    const updates: Promise<any>[] = [];

    for (const product of products) {
      // Check if type needs normalization
      const currentType = String(product.type);
      let correctType: ProductType | null = null;

      // Normalize to proper enum values
      if (currentType.toUpperCase() === 'GENUINE') {
        correctType = ProductType.Genuine;
      } else if (currentType.toUpperCase() === 'AFTERMARKET') {
        correctType = ProductType.Aftermarket;
      } else if (currentType.toUpperCase() === 'BRANDED') {
        correctType = ProductType.Branded;
      }

      // If needs fixing and is different from current
      if (correctType && correctType !== product.type) {
        console.log(`  ⚠️  Fixing: ${product.code} - "${currentType}" → "${correctType}"`);

        updates.push(
          prisma.product.update({
            where: { id: product.id },
            data: { type: correctType },
          })
        );

        fixedCount++;

        // Batch updates in groups of 100 to avoid overloading
        if (updates.length >= 100) {
          await Promise.all(updates);
          updates.length = 0; // Clear array
        }
      }
    }

    // Execute remaining updates
    if (updates.length > 0) {
      await Promise.all(updates);
    }

    console.log(`\n✅ Fixed ${fixedCount} products with incorrect type casing`);

    if (fixedCount === 0) {
      console.log('🎉 All product types are already correct!');
    }

  } catch (error) {
    console.error('❌ Error fixing product types:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  fixProductTypes()
    .then(() => {
      console.log('\n✨ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

export { fixProductTypes };
