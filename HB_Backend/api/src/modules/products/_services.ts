import { typesenseClient } from '@/lib/typesense';
import { ListProductsQuery, ProductCountQuery } from './_dto';

interface Product {
  id: string;
  code: string;
  name: string;
  type: string;
  stock: number;
  currency: string;
  net1: number;
  net2: number;
  net3: number;
  net4: number;
  net5: number;
  net6: number;
  net7: number;
  height?: number;
  length?: number;
  width?: number;
  weight?: number;
  createdAt: number;
  updatedAt: number;
  image?: string;
  supersededBy?: string;
}

interface ProductWithSuperseding extends Product {
  superseding: Product | null;
}

interface ListProductsResult {
  products: ProductWithSuperseding[];
  total: number;
}

export async function listProducts(query: ListProductsQuery): Promise<ListProductsResult> {
  const { page, limit, q, type } = query;

  try {
    // Detect if search query is pure numbers
    const isNumericSearch = /^\d+$/.test(q);

    // Step 1: Search main products in TypeSense
    const searchResult = await typesenseClient
      .collections('products')
      .documents()
      .search({
        q,
        // If numeric search: only search code field with no typos
        // If text search: search both code and name with typo tolerance
        query_by: isNumericSearch ? 'code' : 'code,name',
        num_typos: isNumericSearch ? 0 : '0,2', // No typos for numbers, typos for text
        infix: 'always', // Enable infix/substring search (e.g., "334" matches "3340282" and "ERR334982")
        filter_by: type ? `type:=${type}` : undefined,
        sort_by: '_text_match:desc', // Relevance-based sorting (no type sorting)
        page,
        per_page: limit,
      });

    const hits = searchResult.hits || [];

    // If no results, return empty array
    if (hits.length === 0) {
      return { products: [], total: 0 };
    }

    // Step 2: Collect supersededBy codes from main products
    const supersededByCodes = hits
      .map((hit) => (hit.document as Product).supersededBy)
      .filter(Boolean) as string[];

    // Step 3: Fetch superseding products in a single bulk query
    const supersedingMap = new Map<string, Product>();

    if (supersededByCodes.length > 0) {
      try {
        const supersedingResult = await typesenseClient
          .collections('products')
          .documents()
          .search({
            q: '*',
            query_by: 'code',
            filter_by: `code:[${supersededByCodes.join(',')}]`,
            per_page: supersededByCodes.length,
          });

        const supersedingHits = supersedingResult.hits || [];

        // Build map for O(1) lookups
        for (const hit of supersedingHits) {
          const doc = hit.document as Product;
          supersedingMap.set(doc.code, doc);
        }
      } catch (error) {
        console.error('[Products Service] Failed to fetch superseding products:', error);
        // Continue with empty superseding map
      }
    }

    // Step 4: Build result with embedded superseding products
    const products: ProductWithSuperseding[] = hits.map((hit) => {
      const product = hit.document as Product;

      return {
        ...product,
        superseding: product.supersededBy ? supersedingMap.get(product.supersededBy) || null : null,
      };
    });

    // Step 5: Filter out products where all price lists (net1-net7) are 0
    const filteredProducts = products.filter((product) => {
      const allPricesZero = 
        product.net1 === 0 &&
        product.net2 === 0 &&
        product.net3 === 0 &&
        product.net4 === 0 &&
        product.net5 === 0 &&
        product.net6 === 0 &&
        product.net7 === 0;
      
      return !allPricesZero;
    });

    return {
      products: filteredProducts,
      total: searchResult.found || 0,
    };
  } catch (error) {
    console.error('[Products Service] Search error:', error);
    throw error;
  }
}

interface ProductCountResult {
  all: number;
  aftermarket: number;
  genuine: number;
  branded: number;
}

export async function getProductCounts(query: ProductCountQuery): Promise<ProductCountResult> {
  const { q } = query;

  try {
    // Detect if search query is pure numbers
    const isNumericSearch = /^\d+$/.test(q);

    // Get count for all types
    const allResult = await typesenseClient
      .collections('products')
      .documents()
      .search({
        q,
        query_by: isNumericSearch ? 'code' : 'code,name',
        num_typos: isNumericSearch ? 0 : '0,2',
        infix: 'always',
        per_page: 0, // We only need the count, not the actual documents
      });

    // Get count for each type
    const aftermarketResult = await typesenseClient
      .collections('products')
      .documents()
      .search({
        q,
        query_by: isNumericSearch ? 'code' : 'code,name',
        num_typos: isNumericSearch ? 0 : '0,2',
        infix: 'always',
        filter_by: 'type:=AFTERMARKET',
        per_page: 0,
      });

    const genuineResult = await typesenseClient
      .collections('products')
      .documents()
      .search({
        q,
        query_by: isNumericSearch ? 'code' : 'code,name',
        num_typos: isNumericSearch ? 0 : '0,2',
        infix: 'always',
        filter_by: 'type:=GENUINE',
        per_page: 0,
      });

    const brandedResult = await typesenseClient
      .collections('products')
      .documents()
      .search({
        q,
        query_by: isNumericSearch ? 'code' : 'code,name',
        num_typos: isNumericSearch ? 0 : '0,2',
        infix: 'always',
        filter_by: 'type:=BRANDED',
        per_page: 0,
      });

    return {
      all: allResult.found || 0,
      aftermarket: aftermarketResult.found || 0,
      genuine: genuineResult.found || 0,
      branded: brandedResult.found || 0,
    };
  } catch (error) {
    console.error('[Products Service] Count error:', error);
    throw error;
  }
}
