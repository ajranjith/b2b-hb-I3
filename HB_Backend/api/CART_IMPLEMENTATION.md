# Cart Implementation Summary

## ✅ Schema Created & Migrated

Migration: `20260129102624_add_cart_models`

---

## Schema Overview

### **Cart**
- One active cart per user (`userId @unique`)
- Automatically deleted when user is deleted (`onDelete: Cascade`)

```prisma
model Cart {
  id        Int      @id @default(autoincrement())
  userId    Int      @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     CartItem[]
}
```

---

### **CartItem**
- Links cart to products using `productCode`
- **No price snapshot** - Always fetches current product pricing
- One product per cart (enforced by `@@unique([cartId, productCode])`)
- Cascade deletes when cart deleted

```prisma
model CartItem {
  id          Int      @id @default(autoincrement())
  cartId      Int
  productCode String   // e.g., "LR175451"
  quantity    Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cart         Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product      Product  @relation(fields: [productCode], references: [code], onDelete: Cascade)
  transactions CartItemTransaction[]

  @@unique([cartId, productCode])
}
```

---

### **CartItemTransaction**
- Logs all cart modifications (add/remove/quantity changes)
- Tracks old and new quantities
- Records who made the change (`userId`)

```prisma
model CartItemTransaction {
  id          Int      @id @default(autoincrement())
  cartItemId  Int
  action      CartItemAction
  oldQuantity Int?
  newQuantity Int?
  userId      Int
  createdAt   DateTime @default(now())

  cartItem    CartItem @relation(fields: [cartItemId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id])
}

enum CartItemAction {
  ADDED
  QUANTITY_INCREASED
  QUANTITY_DECREASED
  REMOVED
}
```

---

## Key Features

### 1. **Dynamic Pricing**
✅ No price snapshot - cart items always show current product prices
- When user views cart, fetch latest price from `Product.prices` (where `status=true`)
- Price changes in real-time as products are updated

### 2. **Transaction Logging**
✅ Full audit trail of cart modifications
- Track every add/remove/quantity change
- Useful for analytics and debugging
- Can help identify why users abandon carts

### 3. **No Expiry**
✅ Carts persist indefinitely until user clears or checks out
- Simple, no background cleanup jobs needed

### 4. **No Stock Validation**
✅ Users can add items regardless of stock level
- Validation happens at checkout
- Allows for backorders

---

## Next Steps - Cart APIs

### **Module Structure**
```
src/modules/cart/
  ├── index.ts          # Routes
  ├── _dto.ts           # Zod schemas
  └── _services.ts      # Business logic
```

---

### **Recommended Endpoints**

#### 1. **GET /api/v1/cart**
Get user's cart with items and current pricing

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "userId": 5,
    "createdAt": "2024-01-28T10:00:00Z",
    "items": [
      {
        "id": 1,
        "productCode": "LR175451",
        "quantity": 2,
        "product": {
          "code": "LR175451",
          "name": "Brake Pad Set",
          "type": "GENUINE",
          "currentPrice": {
            "net1": 1000,
            "net2": 900,
            "currency": "GBP"
          },
          "currentStock": 50
        },
        "subtotal": 2000  // quantity * price (based on dealer tier)
      }
    ],
    "summary": {
      "itemCount": 2,
      "totalQuantity": 2,
      "subtotal": 2000,
      "currency": "GBP"
    }
  }
}
```

---

#### 2. **POST /api/v1/cart/items**
Add product to cart

**Request:**
```json
{
  "productCode": "LR175451",
  "quantity": 2
}
```

**Logic:**
1. Get or create cart for user
2. Check if product already in cart:
   - If yes: Update quantity (increment)
   - If no: Create new cart item
3. Create transaction log (`ADDED` or `QUANTITY_INCREASED`)

**Response:**
```json
{
  "success": true,
  "message": "Product added to cart",
  "data": {
    "cartItemId": 1,
    "productCode": "LR175451",
    "quantity": 2
  }
}
```

---

#### 3. **PATCH /api/v1/cart/items/:id**
Update cart item quantity

**Request:**
```json
{
  "quantity": 5
}
```

**Logic:**
1. Validate quantity > 0
2. Get old quantity
3. Update cart item
4. Create transaction log (`QUANTITY_INCREASED` or `QUANTITY_DECREASED`)

**Response:**
```json
{
  "success": true,
  "message": "Quantity updated",
  "data": {
    "id": 1,
    "quantity": 5
  }
}
```

---

#### 4. **DELETE /api/v1/cart/items/:id**
Remove item from cart

**Logic:**
1. Get cart item with current quantity
2. Create transaction log (`REMOVED`, oldQuantity = current, newQuantity = 0)
3. Delete cart item

**Response:**
```json
{
  "success": true,
  "message": "Item removed from cart"
}
```

---

#### 5. **DELETE /api/v1/cart**
Clear entire cart

**Logic:**
1. Get all cart items
2. Create transaction log for each (`REMOVED`)
3. Delete all cart items (or delete entire cart - cascade will handle items)

**Response:**
```json
{
  "success": true,
  "message": "Cart cleared"
}
```

---

## Pricing Calculation Logic

Since there's no price snapshot, calculate pricing on-the-fly:

```typescript
async function getCartWithPricing(userId: number, dealerTier: DealerTier) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
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

  // Calculate pricing based on dealer tier
  const itemsWithPricing = cart.items.map((item) => {
    const price = item.product.prices[0];
    const stock = item.product.stocks[0];

    // Get price for dealer's tier (e.g., Net1, Net2, etc.)
    const tierPrice = price[dealerTier.toLowerCase()]; // e.g., price['net1']

    return {
      ...item,
      product: {
        ...item.product,
        currentPrice: price,
        currentStock: stock?.stock || 0,
      },
      unitPrice: tierPrice,
      subtotal: tierPrice * item.quantity,
    };
  });

  const summary = {
    itemCount: itemsWithPricing.length,
    totalQuantity: itemsWithPricing.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0),
    currency: itemsWithPricing[0]?.product.currentPrice.currency || 'GBP',
  };

  return { ...cart, items: itemsWithPricing, summary };
}
```

---

## Transaction Logging Example

```typescript
async function addToCart(userId: number, productCode: string, quantity: number) {
  // Get or create cart
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  // Check if product already in cart
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productCode: {
        cartId: cart.id,
        productCode,
      },
    },
  });

  if (existingItem) {
    // Update quantity
    const oldQuantity = existingItem.quantity;
    const newQuantity = oldQuantity + quantity;

    await prisma.cartItem.update({
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

    return { cartItemId: existingItem.id, quantity: newQuantity };
  } else {
    // Create new cart item
    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productCode,
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

    return { cartItemId: cartItem.id, quantity };
  }
}
```

---

## Important Notes

### **Dealer Tier Pricing**
Each dealer has different price tiers:
- `genuinePartsTier` - For GENUINE products
- `aftermarketESTier` - For AFTERMARKET products
- `aftermarketBTier` - For BRANDED products

When calculating cart total, use the appropriate tier based on product type.

### **Superseded Products**
If a product in cart is superseded:
```typescript
// Check for supersession
const supersededMapping = await prisma.productSupersededMapping.findFirst({
  where: {
    productCode: item.productCode,
    status: true,
  },
});

if (supersededMapping) {
  // Show warning: "This product has been superseded by {supersededBy}"
  // Optionally: Allow user to swap to new product
}
```

### **Stock Warnings** (Optional)
Even though you don't validate stock, you might want to show warnings:
```typescript
if (item.quantity > currentStock) {
  // Show: "Only {currentStock} in stock. Additional items will be backordered."
}
```

---

## Ready to Implement?

Schema is done! Next steps:
1. Create cart module (`src/modules/cart/`)
2. Implement the 5 endpoints above
3. Add "Add to Cart" button to products API response
4. Test with different dealer tiers

Let me know when you're ready to start implementing the APIs!
