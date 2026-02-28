import Typesense from 'typesense';

/**
 * TypeSense client for search functionality
 */
export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: parseInt(process.env.TYPESENSE_PORT || '8108'),
      protocol: process.env.TYPESENSE_PROTOCOL || 'http',
    },
  ],
  apiKey: process.env.TYPESENSE_API_KEY || 'Hh873bbdS8044w1291',
  connectionTimeoutSeconds: 10,
});

/**
 * Products collection schema
 */
export const PRODUCTS_COLLECTION_SCHEMA = {
  name: 'products',
  fields: [
    { name: 'code', type: 'string' as const, facet: true, infix: true },
    { name: 'name', type: 'string' as const, infix: true },
    { name: 'type', type: 'string' as const, facet: true },
    { name: 'supplierCode', type: 'string' as const, facet: true, optional: true },
    { name: 'stock', type: 'int32' as const },
    { name: 'currency', type: 'string' as const, facet: true },
    { name: 'net1', type: 'float' as const },
    { name: 'net2', type: 'float' as const },
    { name: 'net3', type: 'float' as const },
    { name: 'net4', type: 'float' as const },
    { name: 'net5', type: 'float' as const },
    { name: 'net6', type: 'float' as const },
    { name: 'net7', type: 'float' as const },
    { name: 'height', type: 'float' as const, optional: true },
    { name: 'length', type: 'float' as const, optional: true },
    { name: 'width', type: 'float' as const, optional: true },
    { name: 'weight', type: 'float' as const, optional: true },
    { name: 'createdAt', type: 'int64' as const },
    { name: 'updatedAt', type: 'int64' as const },
    { name: 'image', type: 'string' as const, optional: true },
    { name: 'supersededBy', type: 'string' as const, optional: true },
  ],
};

/**
 * Batch size for syncing products to TypeSense
 * 10,000 products per batch - optimized for performance
 */
export const SYNC_BATCH_SIZE = 10000;
