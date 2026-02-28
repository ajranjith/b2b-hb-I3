import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import type { DealerTier, ProductType } from 'generated/prisma';
import type { AddToCartInput, UpdateCartItemInput } from './_dto';

interface CartSummary {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  total: number;
  formattedSubtotal: string;
  formattedTotal: string;
  currency: string;
}

interface CartItemWithProduct {
  id: number;
  productId: number;
  quantity: number;
  product: {
    id: number;
    code: string;
    name: string;
    type: ProductType;
    supplierCode: string | null;
    image: string | null;
    height: any;
    length: any;
    width: any;
    weight: any;
    currentPrice: any;
    currentStock: number;
  };
  unitPrice: number;
  subtotal: number;
  formattedUnitPrice: string;
  formattedSubtotal: string;
}

// Get or create active cart for user
async function getOrCreateCart(userId: number) {
  let cart = await prisma.cart.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId, status: 'ACTIVE' },
    });
  }

  return cart;
}

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

// Format price
function formatPrice(amount: number, currency: string = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : currency;
  const value = amount.toFixed(2);
  return `${symbol}${value}`;
}

// Add to cart
export async function addToCart(userId: number, input: AddToCartInput) {
  const { productCode, quantity } = input;

  // Find product
  const product = await prisma.product.findUnique({
    where: { code: productCode, status: true },
  });

  if (!product) {
    throw new NotFoundError(`Product with code ${productCode} not found`);
  }

  // Get or create cart
  const cart = await getOrCreateCart(userId);

  // Check if product already in cart
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: product.id,
      },
    },
  });

  if (existingItem) {
    // Update quantity
    const oldQuantity = existingItem.quantity;
    const newQuantity = oldQuantity + quantity;

    const updatedItem = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newQuantity },
    });

    // Log transaction
    await prisma.cartItemTransaction.create({
      data: {
        cartItemId: existingItem.id,
        action: 'QUANTITY_INCREASED',
        oldQuantity,
        newQuantity,
        userId,
      },
    });

    return { cartItemId: updatedItem.id, quantity: newQuantity, added: false };
  } else {
    // Create new cart item
    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        quantity,
      },
    });

    // Log transaction
    await prisma.cartItemTransaction.create({
      data: {
        cartItemId: cartItem.id,
        action: 'ADDED',
        newQuantity: quantity,
        userId,
      },
    });

    return { cartItemId: cartItem.id, quantity, added: true };
  }
}

// Update cart item quantity
export async function updateCartItemQuantity(userId: number, input: UpdateCartItemInput) {
  const { productCode, quantity } = input;

  // Find product
  const product = await prisma.product.findUnique({
    where: { code: productCode, status: true },
  });

  if (!product) {
    throw new NotFoundError(`Product with code ${productCode} not found`);
  }

  // Get active cart
  const cart = await prisma.cart.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  // Find cart item
  const cartItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: product.id,
      },
    },
  });

  if (!cartItem) {
    throw new NotFoundError(`Product ${productCode} not in cart`);
  }

  const oldQuantity = cartItem.quantity;

  // If quantity is 0, remove item
  if (quantity === 0) {
    // Log transaction BEFORE deleting
    await prisma.cartItemTransaction.create({
      data: {
        cartItemId: cartItem.id,
        action: 'REMOVED',
        oldQuantity,
        newQuantity: 0,
        userId,
      },
    });

    // Delete cart item
    await prisma.cartItem.delete({
      where: { id: cartItem.id },
    });

    return { removed: true };
  }

  // Update quantity
  await prisma.cartItem.update({
    where: { id: cartItem.id },
    data: { quantity },
  });

  // Log transaction
  const action = quantity > oldQuantity ? 'QUANTITY_INCREASED' : 'QUANTITY_DECREASED';
  await prisma.cartItemTransaction.create({
    data: {
      cartItemId: cartItem.id,
      action,
      oldQuantity,
      newQuantity: quantity,
      userId,
    },
  });

  return { quantity, removed: false };
}

// Remove cart item
export async function removeCartItem(userId: number, productCode: string) {
  // Find product
  const product = await prisma.product.findUnique({
    where: { code: productCode, status: true },
  });

  if (!product) {
    throw new NotFoundError(`Product with code ${productCode} not found`);
  }

  // Get active cart
  const cart = await prisma.cart.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  // Find cart item
  const cartItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: product.id,
      },
    },
  });

  if (!cartItem) {
    throw new NotFoundError(`Product ${productCode} not in cart`);
  }

  const oldQuantity = cartItem.quantity;

  // Log transaction BEFORE deleting (to avoid foreign key constraint violation)
  await prisma.cartItemTransaction.create({
    data: {
      cartItemId: cartItem.id,
      action: 'REMOVED',
      oldQuantity,
      newQuantity: 0,
      userId,
    },
  });

  // Delete cart item
  await prisma.cartItem.delete({
    where: { id: cartItem.id },
  });

  return { success: true };
}

// Get cart with items and pricing
export async function getCart(userId: number) {
  // Get user with dealer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { dealer: true },
  });

  if (!user?.dealer) {
    throw new NotFoundError('Dealer information not found');
  }

  // Get active cart
  const cart = await prisma.cart.findFirst({
    where: { userId, status: 'ACTIVE' },
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
    return {
      id: null,
      items: [],
      summary: {
        itemCount: 0,
        totalQuantity: 0,
        subtotal: 0,
        total: 0,
        formattedSubtotal: formatPrice(0),
        formattedTotal: formatPrice(0),
        currency: 'GBP',
      },
    };
  }

  // Fetch product images for all cart items
  const productCodes = cart.items.map(item => item.product.code);
  const productImages = await prisma.productImages.findMany({
    where: {
      productCode: { in: productCodes },
      status: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Create a map of productCode -> image URL
  const imageMap = new Map<string, string>();
  productImages.forEach(img => {
    if (!imageMap.has(img.productCode)) {
      imageMap.set(img.productCode, img.image);
    }
  });

  // Calculate pricing for each item
  const itemsWithPricing: CartItemWithProduct[] = cart.items.map((item) => {
    const price = item.product.prices[0];
    const stock = item.product.stocks[0];

    // Get dealer tier for this product type
    const dealerTier = getDealerTierForProduct(item.product.type, user.dealer!);

    // Get price for dealer's tier
    const unitPrice = getPriceForTier(price, dealerTier);
    const subtotal = unitPrice * item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        code: item.product.code,
        name: item.product.name,
        type: item.product.type,
        supplierCode: item.product.supplierCode,
        image: imageMap.get(item.product.code) || null,
        height: item.product.height,
        length: item.product.length,
        width: item.product.width,
        weight: item.product.weight,
        currentPrice: price,
        currentStock: stock?.stock || 0,
      },
      unitPrice,
      subtotal,
      formattedUnitPrice: formatPrice(unitPrice, price.currency),
      formattedSubtotal: formatPrice(subtotal, price.currency),
    };
  });

  // Calculate summary
  const summary: CartSummary = {
    itemCount: itemsWithPricing.length,
    totalQuantity: itemsWithPricing.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0),
    total: itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0), // Same as subtotal for now
    formattedSubtotal: formatPrice(
      itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0),
      itemsWithPricing[0]?.product.currentPrice.currency || 'GBP'
    ),
    formattedTotal: formatPrice(
      itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0),
      itemsWithPricing[0]?.product.currentPrice.currency || 'GBP'
    ),
    currency: itemsWithPricing[0]?.product.currentPrice.currency || 'GBP',
  };

  return {
    id: cart.id,
    items: itemsWithPricing,
    summary,
  };
}

// Replace cart with new items (clears existing items, adds new ones)
export async function replaceCartWithItems(
  userId: number,
  items: Array<{ productCode: string; quantity: number }>
) {
  const cart = await getOrCreateCart(userId);

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id },
  });

  const added: Array<{ productCode: string; quantity: number }> = [];
  for (const item of items) {
    try {
      await addToCart(userId, {
        productCode: item.productCode,
        quantity: item.quantity,
      });
      added.push(item);
    } catch (err) {
      console.warn(`Skipping product ${item.productCode} during reorder:`, err);
    }
  }

  return {
    cartId: cart.id,
    itemCount: added.length,
    skipped: items.length - added.length,
  };
}

// Get cart item count (fast query)
export async function getCartItemCount(userId: number): Promise<number> {
  const result = await prisma.cart.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: {
      _count: {
        select: { items: true },
      },
    },
  });

  return result?._count.items || 0;
}
