# Email System Architecture

## Overview

The email system is now modular and extensible, making it easy to add new email types while maintaining clean separation of concerns.

## Architecture

```
src/
├── services/
│   ├── emailService.ts    # Core SMTP service (generic)
│   └── emailLogger.ts     # Database logging (generic)
├── emails/
│   ├── baseEmail.ts       # Base class for all email handlers
│   ├── emailHelpers.ts    # Formatting utilities
│   ├── orderConfirmation.ts   # Order confirmation handler (pluggable)
│   └── index.ts           # Central export point
└── utils/
    ├── email.ts           # Public API (backward compatible)
    └── emailFacade.ts     # Simple facade over email handlers
```

## Components

### 1. Core Services (Generic)

#### `emailService.ts`
- Handles SMTP configuration
- Manages transporter creation
- Implements retry logic for multiple SMTP servers
- Provider-specific configurations (Microsoft, Gmail, etc.)

**Usage:**
```typescript
import { emailService } from "@/services/emailService";

const result = await emailService.sendEmail({
  to: "user@example.com",
  subject: "Test",
  html: "<p>Hello</p>",
});
```

#### `emailLogger.ts`
- Logs all email attempts to database
- Tracks status: PENDING → SENT/FAILED
- Stores metadata and error messages

**Usage:**
```typescript
import { emailLogger } from "@/services/emailLogger";

await emailLogger.logPending("ORDER_CONFIRMATION", "user@example.com", "Subject");
await emailLogger.logSuccess("ORDER_CONFIRMATION", "user@example.com", "Subject");
await emailLogger.logFailure("ORDER_CONFIRMATION", "user@example.com", "Subject", "Error");
```

### 2. Base Email Handler (Abstract)

#### `baseEmail.ts`
- Abstract base class for all email types
- Handles non-blocking sending with `setImmediate()`
- Automatic database logging
- Error handling and retry logic

**Extend this class** for each new email type.

### 3. Email Helpers (Utilities)

#### `emailHelpers.ts`
- `formatCurrency()` - Format amounts with currency symbols
- `formatDate()` - Format dates in readable format
- `formatOrderStatus()` - Format enum values for display
- `getStatusBadgeStyle()` - Get color coding for status badges
- `loadTemplate()` - Load HTML templates from files
- `replaceVariables()` - Replace {{variables}} in templates
- `replaceTableRows()` - Replace dynamic table content

### 4. Email Handlers (Pluggable)

Each email type has its own handler class extending `BaseEmail`.

#### Example: `orderConfirmation.ts`

```typescript
export class OrderConfirmationEmail extends BaseEmail<OrderConfirmationData> {
  protected emailType = "ORDER_CONFIRMATION";

  protected generateSubject(data) { /* ... */ }
  protected getRecipient(data) { /* ... */ }
  protected generateHTML(data) { /* ... */ }
  protected generateText(data) { /* ... */ }
  protected getMetadata(data) { /* ... */ }
}
```

## Adding a New Email Type

### Step 1: Create Email Handler

Create a new file `src/emails/yourEmailType.ts`:

```typescript
import { BaseEmail } from "./baseEmail";
import { formatDate, loadTemplate } from "./emailHelpers";
import type { EmailType } from "generated/prisma";

export interface YourEmailData {
  recipientEmail: string;
  userName: string;
  // ... other fields
}

export class YourEmail extends BaseEmail<YourEmailData> {
  protected emailType: EmailType = "YOUR_EMAIL_TYPE"; // Must match Prisma enum

  protected generateSubject(data: YourEmailData): string {
    return `Your Subject - ${data.userName}`;
  }

  protected getRecipient(data: YourEmailData): string {
    return data.recipientEmail;
  }

  protected getMetadata(data: YourEmailData): Record<string, any> {
    return {
      userName: data.userName,
      // ... other metadata for logging
    };
  }

  protected generateHTML(data: YourEmailData): string {
    let html = loadTemplate("your_template/index.html");

    // Transform data and replace placeholders
    html = html.replace(/{{userName}}/g, data.userName);
    // ... more replacements

    return html;
  }

  protected generateText(data: YourEmailData): string {
    return `Plain text version...`;
  }
}

// Export singleton instance
export const yourEmail = new YourEmail();
```

### Step 2: Add to Prisma Enum

Add your email type to `prisma/schema.prisma`:

```prisma
enum EmailType {
  ORDER_CONFIRMATION
  YOUR_EMAIL_TYPE    // Add this
  // ... other types
}
```

Run migration:
```bash
bunx prisma migrate dev --name add_your_email_type
```

### Step 3: Export from Index

Add to `src/emails/index.ts`:

```typescript
export { yourEmail, type YourEmailData } from "./yourEmailType";
```

### Step 4: Create Facade Function (Optional)

Add to `src/utils/emailFacade.ts`:

```typescript
import { yourEmail, type YourEmailData } from "@/emails/yourEmailType";

export async function sendYourEmail(data: YourEmailData): Promise<void> {
  await yourEmail.send(data);
}
```

### Step 5: Use It

```typescript
import { sendYourEmail } from "@/utils/email";

// In your code
await sendYourEmail({
  recipientEmail: "user@example.com",
  userName: "John Doe",
});
```

## Benefits of This Architecture

### ✅ Separation of Concerns
- **Core SMTP logic** is separate from **email templates**
- **Database logging** is independent of **email sending**
- Each **email type** is isolated in its own file

### ✅ Easy to Extend
- Add new email type = create one new file
- No need to modify core services
- Pluggable architecture

### ✅ Reusable Components
- `emailService` can be used by any email handler
- `emailLogger` works for all email types
- Helper functions are shared across all emails

### ✅ Type Safety
- Full TypeScript support
- Type-safe data interfaces
- Compile-time error checking

### ✅ Testable
- Each component can be tested independently
- Mock email service for testing handlers
- Mock logger for testing sending logic

### ✅ Maintainable
- Clear file structure
- Single responsibility principle
- Easy to locate and fix bugs

## Usage Examples

### Send Order Confirmation

```typescript
import { sendOrderConfirmationEmail } from "@/utils/email";

await sendOrderConfirmationEmail({
  orderNumber: "HB260201234",
  orderStatus: "PROCESSING",
  orderDate: new Date(),
  itemCount: 5,
  totalAmount: 1234.56,
  currency: "GBP",
  billingFirstName: "John",
  billingLastName: "Doe",
  billingEmail: "john@example.com",
  billingCompanyName: "Acme Corp",
  shippingMethod: "Sea",
  items: [
    {
      productCode: "ABC123",
      productName: "Product 1",
      quantity: 2,
      unitPrice: 100.00,
    },
  ],
});
```

### Direct Service Usage

```typescript
import { emailService } from "@/services/emailService";

// For custom emails not using handlers
const result = await emailService.sendEmail({
  to: "user@example.com",
  subject: "Custom Email",
  html: "<h1>Hello</h1>",
  text: "Hello",
});

if (result.success) {
  console.log("Email sent:", result.messageId);
} else {
  console.error("Email failed:", result.error);
}
```

### Manual Logging

```typescript
import { emailLogger } from "@/services/emailLogger";

await emailLogger.log({
  type: "ORDER_CONFIRMATION",
  recipient: "user@example.com",
  subject: "Test",
  status: "SENT",
  metadata: { orderId: 123 },
});
```

## Migration from Old System

The old monolithic `email.ts` has been replaced with:

**Before:**
```typescript
import { sendOrderConfirmationEmail } from "@/utils/email";
```

**After (same):**
```typescript
import { sendOrderConfirmationEmail } from "@/utils/email";
```

**No changes needed!** The public API remains the same for backward compatibility.

## File Structure Summary

```
Generic Components (Reusable):
├── services/emailService.ts    - SMTP handling
└── services/emailLogger.ts     - Database logging

Email Handlers (Pluggable):
├── emails/baseEmail.ts          - Base class
├── emails/emailHelpers.ts       - Utilities
├── emails/orderConfirmation.ts  - Order emails
├── emails/welcomeEmail.ts       - Welcome emails (future)
├── emails/passwordReset.ts      - Password reset (future)
└── emails/index.ts              - Exports

Public API (Backward Compatible):
├── utils/email.ts               - Main entry point
└── utils/emailFacade.ts         - Simple facade
```

## Future Email Types to Implement

Suggested email handlers to add:

- [ ] `welcomeEmail.ts` - New user welcome
- [ ] `passwordResetEmail.ts` - Password reset
- [ ] `orderStatusUpdateEmail.ts` - Order status changes
- [ ] `invoiceEmail.ts` - Invoice with PDF attachment
- [ ] `adminNotificationEmail.ts` - Admin alerts

Each follows the same pattern - extend `BaseEmail` and implement the required methods!
