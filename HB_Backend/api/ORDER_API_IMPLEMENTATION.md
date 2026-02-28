# Order API Implementation

## Overview
Created order functionality to convert cart to orders with price snapshots and full audit trail.

---

## API Endpoints

### 1. **POST /api/v1/orders** - Create Order from Cart

**Authentication:** Required (Dealer only)

**Request:**
```json
{
  "cartId": 1
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": 1,
    "orderNumber": "ORD-2024-0001",
    "orderStatus": "CREATED",
    "totalAmount": 25000,
    "itemCount": 3,
    "orderDate": "2024-01-30T10:00:00Z"
  }
}
```

**Errors:**
- `400` - Cart is empty or invalid data
- `404` - Cart not found or doesn't belong to user

**What Happens:**
1. Validates cart exists and belongs to user
2. Validates cart status is ACTIVE
3. Validates cart has items
4. Fetches current product prices and stocks
5. Calculates prices based on dealer tiers (Net1-Net7)
6. Generates unique order number (ORD-YYYY-####)
7. Creates order with price snapshots in OrderItem
8. Creates initial OrderStatusHistory ("CREATED")
9. Marks cart as "CONVERTED"
10. Creates new ACTIVE cart for user

---

### 2. **GET /api/v1/orders/:id** - Get Order Details

**Authentication:** Required (Dealer only)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "ORD-2024-0001",
    "orderDate": "2024-01-30T10:00:00Z",
    "orderStatus": "CREATED",
    "totalAmount": 25000,
    "formattedTotal": "£250.00",
    "currency": "GBP",
    "billing": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "companyName": "Doe Motors Ltd"
    },
    "shippingMethod": {
      "id": 1,
      "name": "Standard Shipping"
    },
    "notes": null,
    "items": [
      {
        "id": 1,
        "productCode": "LR175451",
        "productName": "Brake Pad Set",
        "productType": "Genuine",
        "quantity": 2,
        "unitPrice": 10000,
        "subtotal": 20000,
        "dealerTier": "Net2",
        "currency": "GBP",
        "formattedUnitPrice": "£100.00",
        "formattedSubtotal": "£200.00",
        "stockAtOrder": 50,
        "product": {
          "id": 5,
          "code": "LR175451",
          "name": "Brake Pad Set",
          "type": "Genuine",
          "status": true
        }
      }
    ],
    "itemCount": 1,
    "totalQuantity": 2,
    "statusHistory": [
      {
        "id": 1,
        "oldStatus": null,
        "newStatus": "CREATED",
        "notes": "Order created from cart",
        "changedBy": null,
        "createdAt": "2024-01-30T10:00:00Z"
      }
    ],
    "createdAt": "2024-01-30T10:00:00Z",
    "updatedAt": "2024-01-30T10:00:00Z"
  }
}
```

**Errors:**
- `400` - Invalid order ID format
- `404` - Order not found or doesn't belong to user

---

## Key Features

### 1. **Price Snapshot**
OrderItem stores price at time of order:
- `productName` - Product name (immutable)
- `productType` - Product type (immutable)
- `unitPrice` - Price paid based on dealer tier
- `dealerTier` - Which tier was used (Net1-Net7)
- `stockAtOrder` - Stock level at checkout

**Why:** Order history must be permanent. If product price changes tomorrow, order still shows original price.

### 2. **Dealer Tier Pricing**
Each dealer has 3 tiers:
- `genuinePartsTier` - For Genuine products
- `aftermarketESTier` - For Aftermarket products
- `aftermarketBTier` - For Branded products

When creating order, system:
1. Checks product type
2. Gets correct dealer tier
3. Calculates price from that tier
4. Stores tier in OrderItem

**Example:**
```typescript
Product: Type = "Genuine"
Dealer: genuinePartsTier = "Net2"
Price: Net2 = 100 pence (£1.00)
→ OrderItem.unitPrice = 100
→ OrderItem.dealerTier = "Net2"
```

### 3. **Order Number Generation**
Format: `ORD-YYYY-####`
- `YYYY` = Current year
- `####` = Sequential number (0001, 0002, etc.)

**Example:** ORD-2024-0001, ORD-2024-0002, ...

Resets sequence each year.

### 4. **Status History (Audit Trail)**
Every status change is logged in `OrderStatusHistory`:
- Who changed it (`changedBy`)
- What changed (`oldStatus` → `newStatus`)
- When it changed (`createdAt`)
- Why it changed (`notes`)

### 5. **Cart Conversion**
When order is created:
1. Cart status: ACTIVE → CONVERTED
2. New ACTIVE cart is created for user
3. Original cart preserved for reference

---

## Transaction Safety

Order creation uses Prisma transaction:
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create order with items
  // 2. Create status history
  // 3. Mark cart as CONVERTED
  // 4. Create new ACTIVE cart
});
```

If any step fails, entire operation is rolled back.

---

## File Structure

```
api/src/modules/order/
├── index.ts          # Routes (POST /, GET /:id)
├── _dto.ts           # Zod schemas (createOrderSchema)
└── _services.ts      # Business logic (createOrder, getOrderInfo)
```

---

## Database Schema

### Order
```prisma
model Order {
  id                Int
  userId            Int
  orderNumber       String @unique
  orderDate         DateTime
  totalAmount       Int
  shippingMethodId  Int
  billingFirstName  String
  billingLastName   String
  billingEmail      String
  billingCompanyName String?
  orderStatus       OrderStatus
  notes             String?

  items             OrderItem[]
  statusHistory     OrderStatusHistory[]
}
```

### OrderItem (Price Snapshot)
```prisma
model OrderItem {
  id            Int
  orderId       Int
  productId     Int
  productCode   String
  productName   String
  productType   ProductType
  quantity      Int
  unitPrice     Int
  subtotal      Int
  dealerTier    DealerTier
  stockAtOrder  Int?
  currency      String
}
```

### OrderStatusHistory (Audit Trail)
```prisma
model OrderStatusHistory {
  id          Int
  orderId     Int
  oldStatus   OrderStatus?
  newStatus   OrderStatus
  changedBy   Int?
  notes       String?
  createdAt   DateTime
}
```

---

## Next Steps

### 1. **Run Migration**
```bash
cd api
npx prisma migrate dev --name add_order_item_and_status_history
```

### 2. **Test Order Creation**
```bash
# 1. Add items to cart
POST /api/v1/cart/items
{
  "productCode": "LR175451",
  "quantity": 2
}

# 2. Get cart to verify
GET /api/v1/cart

# 3. Create order from cart
POST /api/v1/orders
{
  "cartId": 1
}

# 4. Get order details
GET /api/v1/orders/1
```

### 3. **Future Enhancements**
- GET /api/v1/orders - List all orders for user
- PATCH /api/v1/orders/:id/status - Update order status (admin)
- GET /api/v1/orders/:id/invoice - Generate invoice PDF
- POST /api/v1/orders/:id/cancel - Cancel order
- Shipping cost calculation
- Tax calculation (VAT)
- Discount/promo codes
- Payment integration

---

## Error Handling

All errors follow standard format:
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

**Common errors:**
- `BAD_REQUEST` - Invalid input, empty cart
- `NOT_FOUND` - Cart/order not found
- `VALIDATION_ERROR` - Schema validation failed

---

## Notes

1. **No shipping address yet** - Schema has billing info but no shipping address. You may want to add this later.

2. **Default shipping method** - Currently hardcoded to ID 1. Update logic as needed.

3. **No payment processing** - Order is created with status "CREATED" but no payment. Add payment integration later.

4. **Stock validation** - Currently doesn't validate stock before order creation. Add if needed.

5. **Product deletion protection** - OrderItem has `onDelete: Restrict` on Product. Cannot delete products that are in orders.

---

## Testing Checklist

- [ ] Create order from cart with single item
- [ ] Create order from cart with multiple items
- [ ] Verify price snapshot matches dealer tier
- [ ] Verify status history is created
- [ ] Verify cart is marked CONVERTED
- [ ] Verify new ACTIVE cart is created
- [ ] Try to create order from empty cart (should fail)
- [ ] Try to create order from non-existent cart (should fail)
- [ ] Try to create order from someone else's cart (should fail)
- [ ] Get order details
- [ ] Verify order belongs to correct user
- [ ] Try to get non-existent order (should fail)
- [ ] Try to get someone else's order (should fail)

---

## Complete!

Order create and order info APIs are ready. Run migration and test!
