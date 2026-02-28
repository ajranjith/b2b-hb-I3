import { prisma } from '@/lib/prisma';
import { NotFoundError, BadRequestError } from '@/utils/errors';
import type { DealerTier, ProductType } from 'generated/prisma';
import type { CreateOrderInput, ListOrdersQuery, ExportOrdersQuery, ListBackorderProductsQuery, ExportBackorderProductsQuery, ReorderInput } from './_dto';
import { replaceCartWithItems } from '@/modules/cart/_services';
import { sendOrderConfirmationEmail, sendAdminOrderNotificationEmail } from '@/utils/email';
import { sharePointService } from '@/services/sharepoint';
import ExcelJS from 'exceljs';

// Get dealer tier for product type
function getDealerTierForProduct(
  productType: ProductType,
  dealer: { genuinePartsTier: DealerTier; aftermarketESTier: DealerTier; aftermarketBTier: DealerTier }
): DealerTier {
  switch (productType) {
    case 'Genuine':
      return dealer.genuinePartsTier;
    case 'Aftermarket':
      return dealer.aftermarketESTier;
    case 'Branded':
      return dealer.aftermarketBTier;
    default:
      return dealer.genuinePartsTier;
  }
}

// Get price for dealer tier
function getPriceForTier(price: any, tier: DealerTier): number {
  const tierMap: Record<DealerTier, string> = {
    Net1: 'net1',
    Net2: 'net2',
    Net3: 'net3',
    Net4: 'net4',
    Net5: 'net5',
    Net6: 'net6',
    Net7: 'net7',
  };

  return price[tierMap[tier]] || 0;
}

// Generate unique order number
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const yearLastTwo = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const datePrefix = `HB${yearLastTwo}${month}`;

  // Get the latest order number for this month
  const latestOrder = await prisma.order.findFirst({
    where: {
      orderNumber: {
        startsWith: datePrefix,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  let sequence = 1;
  if (latestOrder) {
    // Extract sequence from order number (e.g., "HB2602-0005" -> 5)
    const match = latestOrder.orderNumber.match(/^HB\d{4}(\d{4})$/);
    if (match) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  // Format: HB + YY + MM + 0001
  return `${datePrefix}${sequence.toString().padStart(4, '0')}`;
}

// Create order from cart
export async function createOrder(userId: number, input: CreateOrderInput) {
  const {
    cartId,
    shippingMethodId: inputShippingMethodId,
    billingOrderNo,
    billingFirstName,
    billingLastName,
    billingEmail,
    billingCompanyName,
    notes,
  } = input;

  // Get user with dealer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { dealer: true },
  });

  if (!user?.dealer) {
    throw new NotFoundError('Dealer information not found');
  }

  // Determine shipping method: input > dealer default > fallback to 1
  const shippingMethodId = inputShippingMethodId || user.dealer.defaultShippingMethodId || 1;

  // Get cart with items
  const cart = await prisma.cart.findFirst({
    where: {
      id: cartId,
      userId,
      status: 'ACTIVE'
    },
    include: {
      items: {
        include: {
          product: {
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
          },
        },
      },
    },
  });

  if (!cart) {
    throw new NotFoundError('Cart not found or does not belong to you');
  }

  if (cart.items.length === 0) {
    throw new BadRequestError('Cannot create order from empty cart');
  }

  // Calculate order items with price snapshots and line numbers
  const orderItemsData = cart.items.map((item, index) => {
    const price = item.product.prices[0];
    const stock = item.product.stocks[0];

    if (!price) {
      throw new BadRequestError(`Product ${item.product.code} does not have pricing information`);
    }

    // Get dealer tier for this product type
    const dealerTier = getDealerTierForProduct(item.product.type, user.dealer!);

    // Get unit price for dealer's tier
    const unitPrice = getPriceForTier(price, dealerTier);

    if (unitPrice === 0) {
      throw new BadRequestError(`Product ${item.product.code} has invalid pricing for your tier`);
    }

    const subtotal = unitPrice * item.quantity;

    return {
      lineNumber: index + 1, // Sequential line number starting from 1
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      productType: item.product.type,
      quantity: item.quantity,
      unitPrice,
      subtotal,
      dealerTier,
      stockAtOrder: stock?.stock || 0,
      currency: price.currency,
    };
  });

  // Calculate total amount
  const totalAmount = orderItemsData.reduce((sum, item) => sum + item.subtotal, 0);

  // Generate order number
  const orderNumber = await generateOrderNumber();

  // Create order with items in a transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create order
    const newOrder = await tx.order.create({
      data: {
        userId,
        orderNumber,
        billingOrderNo: billingOrderNo || null,
        totalAmount,
        shippingMethodId,
        billingFirstName,
        billingLastName,
        billingEmail,
        billingCompanyName: billingCompanyName || null,
        notes: notes || null,
        orderStatus: 'PROCESSING',
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shippingMethod: true,
      },
    });

    // Create initial status history
    await tx.orderStatusHistory.create({
      data: {
        orderId: newOrder.id,
        newStatus: 'PROCESSING',
        notes: 'Order created from cart',
      },
    });

    // Mark cart as CONVERTED
    await tx.cart.update({
      where: { id: cartId },
      data: { status: 'CONVERTED' },
    });

    // Create new ACTIVE cart for user
    await tx.cart.create({
      data: {
        userId,
        status: 'ACTIVE',
      },
    });

    // If dealer doesn't have a default shipping method, set it
    if (!user.dealer!.defaultShippingMethodId) {
      await tx.userDealer.update({
        where: { id: user.dealer!.id },
        data: { defaultShippingMethodId: shippingMethodId },
      });
    }

    return newOrder;
  });

  // Prepare email data
  const emailData = {
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    orderDate: order.orderDate,
    itemCount: order.items.length,
    totalAmount: Number(order.totalAmount),
    currency: orderItemsData[0]?.currency || 'GBP',
    billingFirstName,
    billingLastName,
    billingEmail,
    billingCompanyName: billingCompanyName || null,
    billingOrderNo: order.billingOrderNo || null,
    notes: order.notes || null,
    shippingMethod: order.shippingMethod?.name || 'Not specified',
    items: order.items.map((item) => ({
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
  };

  // Send email to the dealer
  try {
    await sendOrderConfirmationEmail(emailData);
  } catch (error) {
    // Log error but don't fail order creation if email fails
    console.error('Failed to send order confirmation email to dealer:', error);
  }

  // Send notification to admin
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    try {
      await sendAdminOrderNotificationEmail({
        ...emailData,
        orderId: order.id,
        adminEmail,
      });
    } catch (error) {
      // Log error but don't fail order creation if email fails
      console.error('Failed to send order notification email to admin:', error);
    }
  } else {
    console.warn('ADMIN_NOTIFICATION_EMAIL not configured in environment variables');
  }

  // Upload order Excel to SharePoint and update flag
  try {
    const excelBuffer = await exportOrderToExcel(order.id, userId, false);
    const uploadSuccess = await sharePointService.uploadOrderExcel(order.orderNumber, excelBuffer);

    if (uploadSuccess) {
      // Update order to mark as uploaded to SharePoint
      await prisma.order.update({
        where: { id: order.id },
        data: { uploadedToSharePoint: true },
      });
      console.log(`✅ Order ${order.orderNumber} uploaded to SharePoint`);
    }
  } catch (error) {
    // Log error but don't fail order creation if SharePoint upload fails
    console.error('Failed to generate/upload order Excel to SharePoint:', error);
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    totalAmount: order.totalAmount,
    itemCount: order.items.length,
    orderDate: order.orderDate,
  };
}

// Get order info
export async function getOrderInfo(userId: number, orderId: number, isAdmin: boolean = false) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      // If not admin, ensure order belongs to user
      ...(isAdmin ? {} : { userId }),
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      shippingMethod: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        include: {
          changedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // Format order items
  const formattedItems = order.items.map((item) => ({
    id: item.id,
    lineNumber: item.lineNumber,
    productCode: item.productCode,
    productName: item.productName,
    productType: item.productType,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    dealerTier: item.dealerTier,
    currency: item.currency,
    formattedUnitPrice: formatPrice(Number(item.unitPrice), item.currency),
    formattedSubtotal: formatPrice(Number(item.subtotal), item.currency),
    stockAtOrder: item.stockAtOrder,
    qtyOrdered: item.qtyOrdered,
    qtyOutstanding: item.qtyOutstanding,
    inWarehouse: item.inWarehouse,
    product: {
      id: item.product.id,
      code: item.product.code,
      name: item.product.name,
      type: item.product.type,
      status: item.product.status,
    },
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    billingOrderNo: order.billingOrderNo,
    orderDate: order.orderDate,
    orderStatus: order.orderStatus,
    totalAmount: order.totalAmount,
    formattedTotal: formatPrice(Number(order.totalAmount), formattedItems[0]?.currency || 'GBP'),
    currency: formattedItems[0]?.currency || 'GBP',
    billing: {
      firstName: order.billingFirstName,
      lastName: order.billingLastName,
      email: order.billingEmail,
      companyName: order.billingCompanyName,
    },
    shippingMethod: order.shippingMethod ? {
      id: order.shippingMethod.id,
      name: order.shippingMethod.name,
    } : null,
    notes: order.notes,
    items: formattedItems,
    itemCount: formattedItems.length,
    totalQuantity: formattedItems.reduce((sum, item) => sum + item.quantity, 0),
    statusHistory: order.statusHistory.map((history) => ({
      id: history.id,
      oldStatus: history.oldStatus,
      newStatus: history.newStatus,
      notes: history.notes,
      changedBy: history.changedByUser ? {
        id: history.changedByUser.id,
        name: `${history.changedByUser.firstName} ${history.changedByUser.lastName}`.trim(),
        email: history.changedByUser.email,
      } : null,
      createdAt: history.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

// Reorder: add order items to cart, replacing existing cart items
export async function reorderFromOrder(
  userId: number,
  input: ReorderInput,
  isAdmin: boolean = false
) {
  const { orderNumber } = input;
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: { equals: orderNumber, mode: 'insensitive' },
      ...(isAdmin ? {} : { userId }),
    },
    include: {
      items: true,
    },
  });

  if (!order) {
    throw new NotFoundError(`Order with number ${orderNumber} not found`);
  }

  if (order.items.length === 0) {
    throw new BadRequestError('Cannot reorder: order has no items');
  }

  const items = order.items.map((item) => ({
    productCode: item.productCode,
    quantity: item.quantity,
  }));

  return replaceCartWithItems(userId, items);
}

// Format price helper
function formatPrice(amount: number, currency: string = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : currency;
  const value = amount.toFixed(2);
  return `${symbol}${value}`;
}

// List orders with filtering, search, and pagination
export async function listOrders(userId: number, query: ListOrdersQuery, isAdmin: boolean = false) {
  const { page, limit, search, status, type, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    // If not admin, filter by userId
    ...(isAdmin ? {} : { userId }),
  };

  // Filter by search (order number)
  if (search) {
    where.orderNumber = {
      contains: search,
      mode: 'insensitive',
    };
  }

  // Filter by status
  if (status) {
    where.orderStatus = status;
  }

  // Filter by date range
  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) {
      // Use exact datetime provided (includes time if specified)
      where.orderDate.gte = new Date(startDate);
    }
    if (endDate) {
      // Use exact datetime provided (includes time if specified)
      where.orderDate.lte = new Date(endDate);
    }
  } else if (type === 'recent') {
    // Filter by type (recent = last 30 days, all statuses)
    // Only apply if date range is not specified
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    where.orderDate = {
      gte: thirtyDaysAgo,
    };
  }

  // Get total count
  const total = await prisma.order.count({ where });

  // Get paginated orders
  const orders = await prisma.order.findMany({
    where,
    skip,
    take: limit,
    orderBy: { orderDate: 'desc' }, // Sort by latest first
    include: {
      items: {
        select: {
          id: true,
          lineNumber: true,
          productCode: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          currency: true,
          qtyOrdered: true,
          qtyOutstanding: true,
          inWarehouse: true,
        },
      },
      shippingMethod: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Format orders
  const formattedOrders = orders.map((order) => {
    const itemCount = order.items.length;
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const currency = order.items[0]?.currency || 'GBP';

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      billingOrderNo: order.billingOrderNo,
      orderDate: order.orderDate,
      orderStatus: order.orderStatus,
      totalAmount: Number(order.totalAmount),
      formattedTotal: formatPrice(Number(order.totalAmount), currency),
      currency,
      itemCount,
      totalQuantity,
      shippingMethod: order.shippingMethod,
      billing: {
        firstName: order.billingFirstName,
        lastName: order.billingLastName,
        email: order.billingEmail,
        companyName: order.billingCompanyName,
      },
      user: isAdmin ? {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
        email: order.user.email,
      } : undefined,
      items: order.items.map((item) => ({
        id: item.id,
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        formattedSubtotal: formatPrice(Number(item.subtotal), item.currency),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  });

  // Get order counts grouped by status
  const ordersWithStatus = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderStatus: true,
    },
  });

  // Count orders by status
  const statusCounts: Record<string, number> = {};
  const allStatuses = ['BACKORDER', 'PICKING', 'PACKING', 'OUT_FOR_DELIVERY', 'PROCESSING'];
  allStatuses.forEach((status) => {
    statusCounts[status] = 0;
  });

  for (const order of ordersWithStatus) {
    statusCounts[order.orderStatus] = (statusCounts[order.orderStatus] || 0) + 1;
  }

  return {
    orders: formattedOrders,
    total,
    productCountsByStatus: statusCounts,
  };
}

// Export orders to Excel with filtering
export async function exportOrdersToExcel(
  userId: number,
  query: ExportOrdersQuery,
  isAdmin: boolean = false
): Promise<Buffer> {
  const { search, status, type, startDate, endDate } = query;

  // Build where clause (same as listOrders but without pagination)
  const where: any = {
    // If not admin, filter by userId
    ...(isAdmin ? {} : { userId }),
  };

  // Filter by search (order number)
  if (search) {
    where.orderNumber = {
      contains: search,
      mode: 'insensitive',
    };
  }

  // Filter by status
  if (status) {
    where.orderStatus = status;
  }

  // Filter by date range
  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) {
      // Use exact datetime provided (includes time if specified)
      where.orderDate.gte = new Date(startDate);
    }
    if (endDate) {
      // Use exact datetime provided (includes time if specified)
      where.orderDate.lte = new Date(endDate);
    }
  } else if (type === 'recent') {
    // Filter by type (recent = last 30 days, all statuses)
    // Only apply if date range is not specified
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    where.orderDate = {
      gte: thirtyDaysAgo,
    };
  }

  // Get all orders (no pagination for export)
  const orders = await prisma.order.findMany({
    where,
    orderBy: { orderDate: 'desc' },
    include: {
      items: {
        select: {
          id: true,
          lineNumber: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          currency: true,
          productCode: true,
          productName: true,
        },
        orderBy: { lineNumber: 'asc' },
      },
      shippingMethod: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          dealer: {
            select: {
              accountNumber: true,
              companyName: true,
            },
          },
        },
      },
    },
  });

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Orders Export');

  // Define columns matching the single order export format
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Customer Purchase Order Number', key: 'customerPO', width: 30 },
    { header: 'Account Code', key: 'accountCode', width: 20 },
    { header: 'Account Name', key: 'accountName', width: 30 },
    { header: 'Line Number', key: 'lineNumber', width: 12 },
    { header: 'Portal Order Number', key: 'portalOrderNumber', width: 25 },
    { header: 'Part Number', key: 'partNumber', width: 20 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'UOM', key: 'uom', width: 10 },
    { header: 'Price', key: 'price', width: 12 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add order data - matching single order export format
  // First row for each order contains header info, subsequent rows contain line items
  orders.forEach((order) => {
    const accountCode = order.user?.dealer?.accountNumber || '';
    const accountName = order.user?.dealer?.companyName || order.billingCompanyName || '';
    const orderDate = order.orderDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Add order header row (first row for this order)
    worksheet.addRow({
      date: orderDate,
      customerPO: order.billingOrderNo || '',
      accountCode: accountCode,
      accountName: accountName,
      lineNumber: '',
      portalOrderNumber: '',
      partNumber: '',
      quantity: '',
      uom: '',
      price: '',
    });

    // Add line items for this order
    order.items.forEach((item, index) => {
      worksheet.addRow({
        date: '',
        customerPO: '',
        accountCode: '',
        accountName: '',
        lineNumber: index + 1,
        portalOrderNumber: order.orderNumber,
        partNumber: item.productCode || '',
        quantity: item.quantity,
        uom: 'EA', // Unit of Measure - Each/Unit
        price: Number(item.unitPrice || 0),
      });
    });
  });

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    if (column.width) {
      column.width = Math.min(column.width || 10, 50);
    }
  });

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// List backorder products (flat list)
export async function listBackorderProducts(
  userId: number,
  query: { page: number; limit: number; search?: string },
  isAdmin: boolean = false
) {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;

  // Build where clause for orders
  const orderWhere: any = {
    orderStatus: 'BACKORDER',
    ...(isAdmin ? {} : { userId }),
  };

  // Build where clause for order items (search)
  const itemWhere: any = {};
  if (search) {
    itemWhere.OR = [
      {
        order: {
          orderNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        productCode: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        productName: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ];
  }

  // Combine where clauses
  const combinedWhere = {
    ...itemWhere,
    order: orderWhere,
  };

  // Get total count
  const total = await prisma.orderItem.count({ where: combinedWhere });

  // Get paginated order items
  const orderItems = await prisma.orderItem.findMany({
    where: combinedWhere,
    skip,
    take: limit,
    orderBy: [
      { order: { orderNumber: 'asc' } }, // Group by order number
      { id: 'asc' },
    ],
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          billingOrderNo: true,
          orderDate: true,
          orderStatus: true,
        },
      },
      product: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  // Calculate item numbers per order (group items by orderId and assign sequential numbers)
  const orderItemsMap = new Map<number, number>();
  orderItems.forEach((item) => {
    const currentCount = orderItemsMap.get(item.orderId) || 0;
    orderItemsMap.set(item.orderId, currentCount + 1);
  });

  // Reset counter for formatting
  const itemNumbersByOrder = new Map<number, number>();

  // Format products
  const formattedProducts = orderItems.map((item) => {
    // Get and increment item number for this order
    const currentItemNumber = itemNumbersByOrder.get(item.orderId) || 0;
    const itemNumber = currentItemNumber + 1;
    itemNumbersByOrder.set(item.orderId, itemNumber);

    return {
      id: item.id,
      billingOrderNo: item.order.billingOrderNo || '—',
      orderNumber: item.order.orderNumber,
      itemNumber: itemNumber,
      orderDate: item.order.orderDate,
      productCode: item.productCode || item.product?.code || '—',
      productName: item.productName || item.product?.name || '—',
      qtyOrdered: item.qtyOrdered ?? 0,
      inWarehouse: item.inWarehouse ?? 0,
      qtyOutstanding: item.qtyOutstanding ?? 0,
    };
  });

  return {
    products: formattedProducts,
    total,
  };
}

// Export backorder products to Excel
export async function exportBackorderProductsToExcel(
  userId: number,
  query: { search?: string },
  isAdmin: boolean = false
): Promise<Buffer> {
  const { search } = query;

  // Build where clause for orders
  const orderWhere: any = {
    orderStatus: 'BACKORDER',
    ...(isAdmin ? {} : { userId }),
  };

  // Build where clause for order items (search)
  const itemWhere: any = {};
  if (search) {
    itemWhere.OR = [
      {
        order: {
          orderNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        productCode: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        productName: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ];
  }

  // Combine where clauses
  const combinedWhere = {
    ...itemWhere,
    order: orderWhere,
  };

  // Get all backorder items (no pagination for export)
  const orderItems = await prisma.orderItem.findMany({
    where: combinedWhere,
    orderBy: [
      { order: { orderNumber: 'asc' } },
      { id: 'asc' },
    ],
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          billingOrderNo: true,
          orderDate: true,
          orderStatus: true,
        },
      },
      product: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Backorder Products');

  // Define columns (matching the screenshot order)
  worksheet.columns = [
    { header: 'Your Order No', key: 'billingOrderNo', width: 20 },
    { header: 'Our No', key: 'orderNumber', width: 20 },
    { header: 'Itm', key: 'itemNumber', width: 8 },
    { header: 'Part', key: 'productCode', width: 20 },
    { header: 'Description', key: 'productName', width: 40 },
    { header: 'Q Ord', key: 'qtyOrdered', width: 12 },
    { header: 'Q/O', key: 'qtyOutstanding', width: 12 },
    { header: 'In WH', key: 'inWarehouse', width: 12 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Calculate item numbers per order
  const itemNumbersByOrder = new Map<number, number>();

  // Add product data
  orderItems.forEach((item) => {
    // Get and increment item number for this order
    const currentItemNumber = itemNumbersByOrder.get(item.orderId) || 0;
    const itemNumber = currentItemNumber + 1;
    itemNumbersByOrder.set(item.orderId, itemNumber);

    const rowData = {
      billingOrderNo: item.order.billingOrderNo || '—',
      orderNumber: item.order.orderNumber,
      itemNumber: itemNumber,
      productCode: item.productCode || item.product?.code || '—',
      productName: item.productName || item.product?.name || '—',
      qtyOrdered: item.qtyOrdered ?? 0,
      qtyOutstanding: item.qtyOutstanding ?? 0,
      inWarehouse: item.inWarehouse ?? 0,
    };

    worksheet.addRow(rowData);
  });

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    if (column.width) {
      column.width = Math.min(column.width || 10, 50);
    }
  });

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Export individual order to Excel
export async function exportOrderToExcel(
  orderId: number,
  userId: number,
  isAdmin: boolean = false
): Promise<Buffer> {
  // Get order with all details
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          dealer: {
            select: {
              companyName: true,
              accountNumber: true,
            },
          },
        },
      },
      items: {
        include: {
          product: {
            select: {
              code: true,
              name: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // Check authorization - dealers can only export their own orders
  if (!isAdmin && order.userId !== userId) {
    throw new NotFoundError('Order not found');
  }

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Order Export');

  // Define columns
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Customer Purchase Order Number', key: 'customerPO', width: 30 },
    { header: 'Account Code', key: 'accountCode', width: 20 },
    { header: 'Account Name', key: 'accountName', width: 30 },
    { header: 'Line Number', key: 'lineNumber', width: 12 },
    { header: 'Portal Order Number', key: 'portalOrderNumber', width: 25 },
    { header: 'Part Number', key: 'partNumber', width: 20 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'UOM', key: 'uom', width: 10 },
    { header: 'Price', key: 'price', width: 12 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Format order date
  const orderDate = order.orderDate.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Add first row (order header)
  worksheet.addRow({
    date: orderDate,
    customerPO: order.billingOrderNo || '',
    accountCode: order.user.dealer?.accountNumber || '',
    accountName: order.billingCompanyName || order.user.dealer?.companyName || '',
    lineNumber: '',
    portalOrderNumber: '',
    partNumber: '',
    quantity: '',
    uom: '',
    price: '',
  });

  // Add line items
  order.items.forEach((item, index) => {
    worksheet.addRow({
      date: '',
      customerPO: '',
      accountCode: '',
      accountName: '',
      lineNumber: index + 1,
      portalOrderNumber: order.orderNumber,
      partNumber: item.productCode || item.product?.code || '',
      quantity: item.quantity,
      uom: 'EA', // Unit of Measure - Each/Unit
      price: Number(item.unitPrice || 0),
    });
  });

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
