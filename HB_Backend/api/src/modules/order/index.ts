import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { createOrderSchema, listOrdersQuerySchema, exportOrdersQuerySchema, listBackorderProductsQuerySchema, exportBackorderProductsQuerySchema, reorderSchema } from './_dto';
import { createOrder, getOrderInfo, listOrders, exportOrdersToExcel, listBackorderProducts, exportBackorderProductsToExcel, exportOrderToExcel, reorderFromOrder } from './_services';

const orderRoutes = new Hono();

// List orders with filtering and pagination
orderRoutes.get(
  '/',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'List orders with filtering and pagination',
    description: `Get paginated list of orders with filtering and search capabilities.

**Features:**
- Search by order number
- Filter by order status (CREATED, BACKORDER, READY_FOR_SHIPMENT, FULLFILLED, CANCELLED, PROCESSING)
- Filter by date range using startDate and endDate (based on orderDate)
- Filter by type: all (default) or recent (last 30 days) - ignored if date range is specified
- Pagination with accurate counts
- Sorted by latest order date first

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- search: Search by order number (optional)
- status: Filter by order status (optional)
- type: Filter by time period - 'all' or 'recent' (default: all) - ignored if date range is specified
- startDate: Filter orders from this date (ISO date string, optional, inclusive)
- endDate: Filter orders until this date (ISO date string, optional, inclusive)

**Examples:**

Search by order number:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders?search=ORD20260201"
\`\`\`

Filter by status:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders?status=CREATED&page=1&limit=20"
\`\`\`

Get recent orders:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders?type=recent&page=1&limit=20"
\`\`\`

Filter by date range:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders?startDate=2026-01-01&endDate=2026-01-31&page=1&limit=20"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of orders',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    orderNumber: z.string(),
                    billingOrderNo: z.string().nullable(),
                    orderDate: z.date(),
                    orderStatus: z.string(),
                    totalAmount: z.number(),
                    formattedTotal: z.string(),
                    currency: z.string(),
                    itemCount: z.number(),
                    totalQuantity: z.number(),
                    shippingMethod: z.object({
                      id: z.number(),
                      name: z.string(),
                    }).nullable(),
                    billing: z.object({
                      firstName: z.string(),
                      lastName: z.string(),
                      email: z.string(),
                      companyName: z.string().nullable(),
                    }),
                    user: z.object({
                      id: z.number(),
                      name: z.string(),
                      email: z.string(),
                    }).optional(),
                    createdAt: z.date(),
                    updatedAt: z.date(),
                  })
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
                productCountsByStatus: z.object({
                  BACKORDER: z.number(),
                  PICKING: z.number(),
                  PACKING: z.number(),
                  OUT_FOR_DELIVERY: z.number(),
                  PROCESSING: z.number(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  zValidator('query', listOrdersQuerySchema),
  async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    const { orders, total, productCountsByStatus } = await listOrders(user.id, query, isAdmin);

    return c.json({
      success: true,
      data: orders,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      productCountsByStatus,
    });
  }
);

// Create order from cart
orderRoutes.post(
  '/',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Create order from cart',
    description: 'Convert cart to order with price snapshots. Cart will be marked as CONVERTED and a new ACTIVE cart will be created. Optional shippingMethodId can be provided; if not, uses dealer\'s default. If dealer has no default, the chosen shipping method will be saved as their default.',
    responses: {
      200: {
        description: 'Order created successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  orderId: z.number(),
                  orderNumber: z.string(),
                  orderStatus: z.string(),
                  totalAmount: z.number(),
                  itemCount: z.number(),
                  orderDate: z.date(),
                }),
              })
            ),
          },
        },
      },
      400: {
        description: 'Bad request - Empty cart or invalid data',
      },
      404: {
        description: 'Cart not found',
      },
    },
  }),
  zValidator('json', createOrderSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const result = await createOrder(user.id, input);

    return c.json({
      success: true,
      message: 'Order created successfully',
      data: result,
    });
  }
);

// Reorder: add order items to cart (replaces existing cart items)
orderRoutes.post(
  '/reorder',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Reorder from existing order',
    description: 'Add all items from an existing order to the cart. Any existing cart items will be replaced.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              orderNumber: { type: 'string', description: 'Order number to reorder from' },
            },
            required: ['orderNumber'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Order items added to cart successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  cartId: z.number(),
                  itemCount: z.number(),
                  skipped: z.number(),
                }),
              })
            ),
          },
        },
      },
      400: {
        description: 'Order has no items',
      },
      404: {
        description: 'Order not found',
      },
    },
  }),
  zValidator('json', reorderSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const isAdmin = user.role === 'Admin';

    const result = await reorderFromOrder(user.id, input, isAdmin);

    return c.json({
      success: true,
      message: result.skipped > 0
        ? `Order items added to cart. ${result.itemCount} items added, ${result.skipped} skipped (product may be discontinued).`
        : 'Order items added to cart. Existing cart items were replaced.',
      data: result,
    });
  }
);

// Get order status options
orderRoutes.get(
  '/status/options',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Get order status options',
    description: 'Retrieve the list of possible order status values',
    responses: {
      200: {
        description: 'List of order status options',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(z.string()),
              })
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const statusOptions = [
      "BACKORDER",
      "PICKING",
      "PACKING",
      "OUT_FOR_DELIVERY",
      "PROCESSING"
    ];

    return c.json({
      success: true,
      data: statusOptions,
    });
  }
);

// Export Order List with filter
orderRoutes.get(
  '/export',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Export orders to Excel with filtering',
    description: `Export orders to Excel file with the same filtering capabilities as the list endpoint.

**Features:**
- Search by order number
- Filter by order status (CREATED, BACKORDER, READY_FOR_SHIPMENT, FULLFILLED, CANCELLED, PROCESSING)
- Filter by type: all (default) or recent (last 30 days)
- Exports all matching orders (no pagination)
- Includes order details, billing information, and user information (for admins)
- Returns Excel file (.xlsx) for download

**Query Parameters:**
- search: Search by order number (optional)
- status: Filter by order status (optional)
- type: Filter by time period - 'all' or 'recent' (default: all)

**Examples:**

Export all orders:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/export" \\
  --output orders.xlsx
\`\`\`

Export filtered by status:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/export?status=COMPLETED" \\
  --output completed_orders.xlsx
\`\`\`

Export recent orders:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/export?type=recent" \\
  --output recent_orders.xlsx
\`\`\`

Export with search:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/export?search=ORD20260201" \\
  --output searched_orders.xlsx
\`\`\``,
    responses: {
      200: {
        description: 'Excel file with orders',
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  zValidator('query', exportOrdersQuerySchema),
  async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    // Export orders to Excel
    const excelBuffer = await exportOrdersToExcel(user.id, query, isAdmin);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${timestamp}.xlsx`;

    // Set headers for file download
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Length', excelBuffer.length.toString());

    // Return Excel file (convert Buffer to Uint8Array for Hono)
    return c.body(new Uint8Array(excelBuffer));
  }
);


// List backorder products (flat list)
orderRoutes.get(
  '/backorders/products',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'List backorder products',
    description: `Get paginated flat list of products with backorder status.

**Features:**
- Flat list of products (not nested by orders)
- Search by order number, product code, or product name
- Pagination with accurate counts
- Grouped and sorted by order number

**Query Parameters:**
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- search: Search by order number, product code, or product name (optional)

**Examples:**

Get all backorder products:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/backorders/products?page=1&limit=20"
\`\`\`

Search backorder products:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/backorders/products?search=ABC123"
\`\`\``,
    responses: {
      200: {
        description: 'Paginated list of backorder products',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(
                  z.object({
                    id: z.number(),
                    billingOrderNo: z.string(),
                    orderNumber: z.string(),
                    itemNumber: z.number(),
                    orderDate: z.date(),
                    productCode: z.string(),
                    productName: z.string(),
                    qtyOrdered: z.number(),
                    inWarehouse: z.number(),
                    qtyOutstanding: z.number(),
                  })
                ),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  zValidator('query', listBackorderProductsQuerySchema),
  async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    const { products, total } = await listBackorderProducts(user.id, query, isAdmin);

    return c.json({
      success: true,
      data: products,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }
);

// Export backorder products to Excel
orderRoutes.get(
  '/backorders/products/export',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Export backorder products to Excel',
    description: `Export all backorder products to Excel file.

**Features:**
- Exports all backorder products (no pagination)
- Search by order number, product code, or product name
- Grouped and sorted by order number
- Returns Excel file (.xlsx) for download

**Query Parameters:**
- search: Search by order number, product code, or product name (optional)

**Examples:**

Export all backorder products:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/backorders/products/export" \\
  --output backorder_products.xlsx
\`\`\`

Export with search:
\`\`\`bash
curl -H "Cookie: token=YOUR_TOKEN" \\
  "http://localhost:3000/api/v1/orders/backorders/products/export?search=ABC123" \\
  --output backorder_products.xlsx
\`\`\``,
    responses: {
      200: {
        description: 'Excel file with backorder products',
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  zValidator('query', exportBackorderProductsQuerySchema),
  async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    // Export backorder products to Excel
    const excelBuffer = await exportBackorderProductsToExcel(user.id, query, isAdmin);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `backorder_products_export_${timestamp}.xlsx`;

    // Set headers for file download
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Length', excelBuffer.length.toString());

    // Return Excel file (convert Buffer to Uint8Array for Hono)
    return c.body(new Uint8Array(excelBuffer));
  }
);

// Get order info
orderRoutes.get(
  '/:id',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Get order details',
    description: 'Get detailed information about a specific order including items, pricing snapshots, and status history',
    responses: {
      200: {
        description: 'Order details',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  orderNumber: z.string(),
                  billingOrderNo: z.string().nullable().optional(),
                  orderDate: z.date(),
                  orderStatus: z.string(),
                  totalAmount: z.number(),
                  formattedTotal: z.string(),
                  currency: z.string(),
                  billing: z.object({
                    firstName: z.string(),
                    lastName: z.string(),
                    email: z.string(),
                    companyName: z.string().nullable(),
                  }),
                  shippingMethod: z.object({
                    id: z.number(),
                    name: z.string(),
                  }).nullable(),
                  notes: z.string().nullable(),
                  items: z.array(z.any()),
                  itemCount: z.number(),
                  totalQuantity: z.number(),
                  statusHistory: z.array(z.any()),
                  createdAt: z.date(),
                  updatedAt: z.date(),
                }),
              })
            ),
          },
        },
      },
      404: {
        description: 'Order not found',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const orderId = parseInt(c.req.param('id'));

    if (isNaN(orderId)) {
      return c.json(
        {
          success: false,
          message: 'Invalid order ID',
        },
        400
      );
    }

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    const order = await getOrderInfo(user.id, orderId, isAdmin);

    return c.json({
      success: true,
      data: order,
    });
  }
);

// Export individual order to Excel
orderRoutes.get(
  '/:id/export',
  authenticate,
  describeRoute({
    tags: ['Order'],
    summary: 'Export individual order to Excel',
    description: `Export a single order with all line items to Excel file.

**Format:**
- First row contains order-level information (Date, Customer PO, Account details)
- Following rows contain line item details with Portal Order Number repeating for each item

**Columns:**
1. Date - Order date
2. Customer Purchase Order Number - Dealer's PO number
3. Account Code - Dealer account code
4. Account Name - Dealer company name
5. Line Number - Sequential item number
6. Portal Order Number - System order number
7. Part Number - Product code
8. Quantity - Quantity ordered
9. UOM - Unit of Measure (EA = Each)
10. Price - Unit price

**Authorization:**
- Dealers can only export their own orders
- Admins can export any order`,
    responses: {
      200: {
        description: 'Excel file with order details',
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      404: {
        description: 'Order not found',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const orderId = parseInt(c.req.param('id'));

    if (isNaN(orderId)) {
      return c.json(
        {
          success: false,
          message: 'Invalid order ID',
        },
        400
      );
    }

    // Check if user is admin
    const isAdmin = user.role === 'Admin';

    // Export order to Excel
    const excelBuffer = await exportOrderToExcel(orderId, user.id, isAdmin);

    // Get order number for filename
    const order = await getOrderInfo(user.id, orderId, isAdmin);
    const filename = `order_${order.orderNumber}_export.xlsx`;

    // Set headers for file download
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);

    // Return Excel file (convert Buffer to Uint8Array for Hono)
    return c.body(new Uint8Array(excelBuffer));
  }
);

export default orderRoutes;
