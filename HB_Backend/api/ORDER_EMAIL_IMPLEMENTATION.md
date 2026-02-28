# Order Confirmation Email Implementation

## Overview

Implemented dealer order confirmation emails with non-blocking delivery and database logging for the Hotbray backend system.

## What Was Implemented

### 1. Database Logging

**Added `EmailLog` model to Prisma schema** (`prisma/schema.prisma`)

```prisma
model EmailLog {
  id             Int         @id @default(autoincrement())
  type           EmailType
  recipient      String
  subject        String
  emailStatus    EmailStatus @default(PENDING)
  errorMessage   String?
  relatedOrderId Int?
  relatedUserId  Int?
  metadata       Json?
  sentAt         DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

enum EmailType {
  ORDER_CONFIRMATION
  ORDER_STATUS_UPDATE
  WELCOME
  PASSWORD_RESET
  ADMIN_NOTIFICATION
  INVOICE
}

enum EmailStatus {
  PENDING
  SENT
  FAILED
}
```

**Migration Applied:** `20260205100824_add_email_log`

### 2. Email Utility Enhancement

**Updated** `src/utils/email.ts` with:

- ✅ **Non-blocking email sending** using `setImmediate()`
- ✅ **Database logging** for all email attempts (PENDING → SENT/FAILED)
- ✅ **Dealer template support** - uses `order_confirmation_dealer/index.html`
- ✅ **Error tracking** with detailed error messages and metadata
- ✅ **Multi-SMTP retry** logic for Microsoft accounts
- ✅ **Comprehensive logging** to console and database

### 3. Order Creation Integration

**Already integrated** in `src/modules/order/_services.ts` (lines 238-262):

```typescript
// Send email to the dealer
try {
  await sendOrderConfirmationEmail({
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
    shippingMethod: order.shippingMethod?.name || 'Not specified',
    items: order.items.map((item) => ({
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
  });
} catch (error) {
  // Log error but don't fail order creation if email fails
  console.error('Failed to send order confirmation email:', error);
}
```

## How It Works

### Order Creation Flow

1. **User creates order** via `POST /api/v1/orders`
2. **Order is saved** to database with all items
3. **Email log created** with status `PENDING`
4. **Email sent asynchronously** (non-blocking)
5. **Email log updated** to `SENT` or `FAILED` based on result

### Non-Blocking Implementation

```typescript
export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<void> {
  // Log immediately as PENDING
  await logEmail("ORDER_CONFIRMATION", email, subject, "PENDING", ...);

  // Send email in background (non-blocking)
  setImmediate(async () => {
    await sendOrderEmailAsync(data, subject);
  });
}
```

**Benefits:**
- Order creation API responds immediately
- Email failures don't block order creation
- All attempts are logged in database
- Easy to monitor and debug email issues

### Database Logging Features

Every email attempt logs:
- **Type**: `ORDER_CONFIRMATION`
- **Recipient**: Dealer email
- **Subject**: Full email subject
- **Status**: `PENDING` → `SENT` or `FAILED`
- **Error Message**: Detailed error if failed
- **Metadata**: Order details, SMTP host, message ID
- **Timestamps**: Created, updated, and sent times

### Query Email Logs

```sql
-- Get all failed emails
SELECT * FROM "EmailLog" WHERE "emailStatus" = 'FAILED';

-- Get order confirmation emails
SELECT * FROM "EmailLog" WHERE type = 'ORDER_CONFIRMATION';

-- Get emails for specific recipient
SELECT * FROM "EmailLog" WHERE recipient = 'dealer@example.com';

-- Get recent email activity
SELECT * FROM "EmailLog" ORDER BY "createdAt" DESC LIMIT 20;
```

## Email Template

**Template:** `src/templates/email/order_confirmation_dealer/index.html`

### Dynamic Fields Populated:

- Order number
- Order status with color-coded badge
- Order date
- Item count
- Billing information (name, company, email)
- Shipping method
- Total amount with currency
- Product table with all items (code, name, quantity, price)

### Template Placeholders Replaced:

- `#ORD-XXXX` → Actual order number
- Order status → Dynamic (Processing, Created, etc.)
- Dates → Formatted order date
- Item counts → Actual item count
- Billing info → Dealer details
- Product rows → Dynamic product list

## Testing

### Test Email Sending

Create a test order:

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{
    "cartId": 1,
    "billingFirstName": "Test",
    "billingLastName": "User",
    "billingEmail": "test@example.com",
    "billingCompanyName": "Test Company",
    "shippingMethodId": 1
  }'
```

### Check Email Logs

Query the database:

```sql
-- Check latest email logs
SELECT * FROM "EmailLog" ORDER BY "createdAt" DESC LIMIT 10;

-- Check failed emails
SELECT
  id,
  type,
  recipient,
  "emailStatus",
  "errorMessage",
  "createdAt"
FROM "EmailLog"
WHERE "emailStatus" = 'FAILED'
ORDER BY "createdAt" DESC;
```

### Monitor Email Logs in Real-Time

Use Prisma Studio:

```bash
cd api
bunx prisma studio
```

Navigate to `EmailLog` table to view all email attempts.

## Configuration

SMTP settings are configured in `.env`:

```env
# SMTP Configuration (Microsoft Office 365)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ajith@dgstechlimited.com
SMTP_PASSWORD=mzkzscdbsvqvmhvc
SMTP_FROM=ajith@dgstechlimited.com
```

## Error Handling

### If Email Fails:

1. ✅ Order creation **still succeeds**
2. ✅ Error is **logged to database** with details
3. ✅ Error is **logged to console**
4. ✅ Admin can **query failed emails** and retry if needed

### Common Errors Logged:

- SMTP authentication failure
- Network timeout
- Invalid recipient
- Template rendering errors
- SMTP server unavailable

## Best Practices Implemented

✅ **Non-blocking** - Uses `setImmediate()` for async processing
✅ **Database logging** - All attempts tracked with status
✅ **Error resilience** - Email failures don't break orders
✅ **Detailed logging** - Full error context in database
✅ **Multi-SMTP retry** - Tries multiple SMTP servers for Microsoft accounts
✅ **Template-based** - Easy to update email design
✅ **Type-safe** - Full TypeScript support
✅ **Metadata tracking** - Order details stored with each email log

## Monitoring & Maintenance

### Daily Monitoring Queries

```sql
-- Failed emails today
SELECT COUNT(*) FROM "EmailLog"
WHERE "emailStatus" = 'FAILED'
  AND "createdAt" >= CURRENT_DATE;

-- Success rate
SELECT
  "emailStatus",
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM "EmailLog"
WHERE "createdAt" >= CURRENT_DATE
GROUP BY "emailStatus";
```

### Retry Failed Emails

If emails fail, you can:
1. Check `EmailLog` table for error details
2. Fix SMTP configuration if needed
3. Manually resend using saved metadata
4. Or wait for automatic retry (if implemented)

## Future Enhancements

Potential improvements:

- [ ] Automatic retry for failed emails
- [ ] Email queue system (Bull, BullMQ)
- [ ] Email templates with better variable system (Handlebars, EJS)
- [ ] Admin dashboard for email monitoring
- [ ] Webhook notifications for failed emails
- [ ] Email open/click tracking
- [ ] A/B testing for email templates
- [ ] Multi-language email support

## Files Modified/Created

### Modified:
- `prisma/schema.prisma` - Added EmailLog model
- `src/utils/email.ts` - Enhanced with logging and non-blocking
- `src/utils/emailTemplates.ts` - Added dealer template reference

### Created:
- `prisma/migrations/20260205100824_add_email_log/` - Database migration

### Existing (No changes):
- `src/modules/order/_services.ts` - Already calls sendOrderConfirmationEmail
- `src/templates/email/order_confirmation_dealer/index.html` - Template already exists

## Summary

The order confirmation email system is now:
- ✅ **Production-ready** with non-blocking delivery
- ✅ **Fully logged** to database for monitoring
- ✅ **Error-resilient** - won't break order creation
- ✅ **Easy to debug** with detailed error logs
- ✅ **Simple to extend** for other email types

All order confirmations are now automatically sent to dealers with comprehensive logging!
