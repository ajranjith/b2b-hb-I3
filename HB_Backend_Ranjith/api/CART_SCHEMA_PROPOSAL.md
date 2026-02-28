# Cart Schema Proposal

## Overview

Cart system for authenticated users only (no guest carts). Tracks cart state, items, and all transactions for audit trail.

---

## Proposed Schema

### 1. **Cart**
Main cart entity - one active cart per user

```prisma
model Cart {
  id        Int      @id @default(autoincrement())
  userId    Int      @unique // One active cart per user
  status    CartStatus @default(ACTIVE)
  expiresAt DateTime? // Optional: Auto-cleanup abandoned carts after X days
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     CartItem[]

  @@index([userId])
  @@index([status])
  @@index([expiresAt])
}

enum CartStatus {
  ACTIVE       // User is actively shopping
  ABANDONED    // User hasn't touched cart in X days
  CONVERTED    // Cart was converted to order (keep for reference)
  EXPIRED      // Cart expired and was cleaned up
}
```

**Why:**
- `userId @unique` - Ensures one active cart per user
- `status` - Track cart lifecycle (active → abandoned → converted/expired)
- `expiresAt` - Auto-cleanup old carts (optional, can set to 30/60 days)
- Cascade delete - If user deleted, cart deleted too

---

### 2. **CartItem**
Individual items in the cart

```prisma
model CartItem {
  id         Int      @id @default(autoincrement())
  cartId     Int
  productCode String   // Product code (not ID, since products can be superseded)
  quantity   Int      @default(1)

  // Snapshot pricing at time of add (important!)
  priceSnapshot CartItemPriceSnapshot?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  cart       Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productCode], references: [code], onDelete: Cascade)
  transactions CartItemTransaction[]

  @@unique([cartId, productCode]) // One entry per product per cart
  @@index([cartId])
  @@index([productCode])
}

model CartItemPriceSnapshot {
  id          Int    @id @default(autoincrement())
  cartItemId  Int    @unique

  // Snapshot of pricing at add time (prevents price changes mid-cart)
  currency    String @default("GBP")
  net1        Int    // Store all tiers
  net2        Int
  net3        Int
  net4        Int
  net5        Int
  net6        Int
  net7        Int

  // Product details snapshot
  productName String
  productType ProductType
  stock       Int

  createdAt   DateTime @default(now())

  cartItem    CartItem @relation(fields: [cartItemId], references: [id], onDelete: Cascade)

  @@index([cartItemId])
}
```

**Why:**
- `productCode` - Uses product code instead of ID (handles superseded products better)
- `@@unique([cartId, productCode])` - Prevents duplicate products in same cart
- **Price Snapshot** - Critical! Stores pricing at time of add:
  - Prevents confusion if prices change while user shops
  - Stores all tiers (Net1-Net7) for dealer tier pricing
  - Stores product details (name, type, stock) for display consistency
- Cascade delete - If cart deleted, items deleted too

---

### 3. **CartItemTransaction**
Audit trail of all cart item changes

```prisma
model CartItemTransaction {
  id         Int      @id @default(autoincrement())
  cartItemId Int
  action     CartItemAction

  // Track what changed
  oldQuantity Int?
  newQuantity Int?

  // Optional: Track price changes if you want
  oldPrice    Int?
  newPrice    Int?

  // Metadata
  userId     Int      // Who made the change
  createdAt  DateTime @default(now())

  cartItem   CartItem @relation(fields: [cartItemId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@index([cartItemId])
  @@index([userId])
  @@index([createdAt])
  @@index([action])
}

enum CartItemAction {
  ADDED              // Item first added to cart
  QUANTITY_INCREASED // User increased quantity
  QUANTITY_DECREASED // User decreased quantity
  REMOVED            // Item removed from cart
  PRICE_UPDATED      // Price changed (by system, not user)
}
```

**Why:**
- Full audit trail of every cart change
- `oldQuantity/newQuantity` - Track exactly what changed
- `userId` - Track who made the change (for multi-user systems or admin actions)
- `action` enum - Clear categorization of change types
- Useful for analytics: abandoned cart reasons, popular products, etc.

---

## Alternative: Simplified Version (If Transactions Not Needed)

If you don't need full transaction history, you can simplify:

```prisma
// Simpler CartItem without transactions
model CartItem {
  id          Int      @id @default(autoincrement())
  cartId      Int
  productCode String
  quantity    Int      @default(1)

  // Pricing snapshot
  currency    String   @default("GBP")
  net1        Int
  net2        Int
  net3        Int
  net4        Int
  net5        Int
  net6        Int
  net7        Int
  productName String
  productType ProductType
  stock       Int

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cart        Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product     Product  @relation(fields: [productCode], references: [code], onDelete: Cascade)

  @@unique([cartId, productCode])
  @@index([cartId])
  @@index([productCode])
}
```

**Pros:**
- Simpler schema
- Faster queries (no joins to transactions)
- Easier to maintain

**Cons:**
- No audit trail
- Can't track why cart was abandoned
- Can't analyze user behavior patterns

---

## Key Design Decisions

### 1. **Price Snapshot - Critical!**
**Question:** Should cart items store price at add time or always fetch latest?

**Recommendation:** ✅ **Store snapshot**

**Why:**
- User adds item at $100
- Price changes to $120 while they shop
- Without snapshot: Cart total changes unexpectedly (bad UX)
- With snapshot: Price locked at $100, user sees consistent total

**Implementation:**
When user adds to cart:
```typescript
// Get current product pricing
const product = await prisma.product.findUnique({
  where: { code: productCode },
  include: {
    prices: { where: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 }
  }
});

// Create cart item with price snapshot
await prisma.cartItem.create({
  data: {
    cartId,
    productCode,
    quantity,
    priceSnapshot: {
      create: {
        currency: price.currency,
        net1: price.net1,
        net2: price.net2,
        // ... all tiers
        productName: product.name,
        productType: product.type,
        stock: currentStock.stock,
      }
    }
  }
});
```

---

### 2. **Product Code vs Product ID**
**Using:** `productCode` (string)

**Why:**
- Your products use codes like "LR175451"
- Products can be superseded (LR175451 → LR175999)
- Using code makes it easier to handle supersession in cart

**Superseded Product Handling:**
When displaying cart:
```typescript
const cartItem = await prisma.cartItem.findUnique({
  where: { id },
  include: {
    product: {
      include: { supersededMapping: true }
    }
  }
});

if (cartItem.product.supersededMapping?.status) {
  // Show: "Product superseded by LR175999. Update cart?"
}
```

---

### 3. **One Cart Per User**
**Using:** `userId @unique` on Cart

**Why:**
- Simpler UX (no "select cart" dropdown)
- One active shopping session per user
- When user converts cart to order, mark old cart as CONVERTED and create new ACTIVE cart

**Alternative:** Remove `@unique` if you want cart history
```prisma
model Cart {
  userId Int // No @unique
  status CartStatus @default(ACTIVE)

  @@unique([userId, status]) // One ACTIVE cart per user
}
```

---

### 4. **Transaction History - To Include or Not?**

**Option A: Include Transactions** (Recommended for analytics)
- Track every add/remove/quantity change
- Useful for abandoned cart analysis
- Can send "You left items in cart" emails
- Analytics: most removed products, average cart lifetime

**Option B: Skip Transactions** (Simpler)
- Just track current state
- Faster, simpler queries
- Good enough for basic cart functionality

**My Recommendation:** ✅ **Include transactions**
- Minimal performance impact
- Huge value for analytics and debugging
- Can help with abandoned cart recovery (big revenue driver)

---

## Typical Cart Flow

```typescript
// 1. User adds product to cart
POST /api/v1/cart/items
{
  "productCode": "LR175451",
  "quantity": 2
}

// 2. Create cart if doesn't exist
const cart = await prisma.cart.upsert({
  where: { userId: user.id },
  update: {},
  create: { userId: user.id }
});

// 3. Add item with price snapshot
const cartItem = await prisma.cartItem.create({
  data: {
    cartId: cart.id,
    productCode,
    quantity,
    priceSnapshot: { create: { ...priceData } }
  }
});

// 4. Create transaction log
await prisma.cartItemTransaction.create({
  data: {
    cartItemId: cartItem.id,
    action: 'ADDED',
    newQuantity: quantity,
    userId: user.id
  }
});

// 5. User updates quantity
PATCH /api/v1/cart/items/:id
{ "quantity": 5 }

// 6. User removes item
DELETE /api/v1/cart/items/:id

// 7. User checks out (convert cart to order)
POST /api/v1/orders
// Mark cart as CONVERTED, create Order from CartItems
```

---

## Questions for You

1. **Price Snapshot:** Do you want to store price snapshot in CartItem or separate table (`CartItemPriceSnapshot`)?
   - Embedded: Flatter structure, all in CartItem
   - Separate: Cleaner separation, easier to query

2. **Transactions:** Do you need full transaction history or just current cart state?

3. **Cart Expiry:** Should old carts auto-expire after X days? (30/60 days)

4. **Multiple Carts:** One active cart per user or allow cart history?

5. **Stock Validation:** Should adding to cart reserve stock or just validate at checkout?

---

## My Recommendation

Use **Full Schema with Transactions** (first proposal):
- Better for analytics and debugging
- Audit trail helps with customer support
- Abandoned cart recovery = revenue
- Minimal performance impact

**Next Steps:**
1. You review and approve schema
2. I'll add it to `schema.prisma`
3. Run migration
4. Create cart APIs (CRUD operations)
5. Add to products API ("Add to Cart" button)

What do you think? Any changes needed?
