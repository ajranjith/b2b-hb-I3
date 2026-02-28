# Email Notification Setup Summary

## What's Been Set Up

The base email notification system has been successfully configured with nodemailer and Microsoft SMTP support.

## Files Created

### Core Service Files
- **`src/services/email.ts`** - Main email service with nodemailer configuration
- **`src/utils/emailTemplates.ts`** - Template management utilities
- **`src/services/emailExamples.ts`** - Integration examples for common use cases

### Templates
- **`src/templates/email/welcome.html`** - Welcome email template
- **`src/templates/email/index.html`** - Existing order confirmation template

### Scripts & Documentation
- **`src/scripts/testEmail.ts`** - Test script to verify email configuration
- **`src/services/EMAIL_SERVICE_USAGE.md`** - Complete usage guide

## Configuration Required

### 1. Update `.env` File

You need to set your Microsoft SMTP credentials in `.env`:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com       # Replace with your email
SMTP_PASSWORD=your-app-password        # Replace with app password
SMTP_FROM=noreply@hotbray.com
```

### 2. Generate Microsoft App Password

For Microsoft/Office 365 accounts:
1. Go to https://account.microsoft.com/security
2. Enable 2-factor authentication (if not already enabled)
3. Generate an "App Password" for SMTP
4. Use this app password in `SMTP_PASSWORD` (not your regular password)

## Testing the Setup

Once you've configured the credentials, test the email service:

```bash
# Test with a specific email address
TEST_EMAIL=your-test-email@example.com bun run test:email

# Or use the default from .env
bun run test:email
```

## Quick Start Guide

### Send a Simple Email

```typescript
import { emailService } from "@/services/email";

await emailService.sendEmail({
  to: "user@example.com",
  subject: "Hello!",
  html: "<h1>Welcome</h1>",
});
```

### Send Template-Based Email

```typescript
import { emailService } from "@/services/email";
import { EMAIL_TEMPLATES, buildEmailVariables } from "@/utils/emailTemplates";

const variables = buildEmailVariables({
  customerName: "John Doe",
  message: "Welcome to Hotbray!",
  actionText: "Get Started",
  actionUrl: "https://hotbray.com/dashboard",
  year: "2026",
});

await emailService.sendTemplateEmail(
  "user@example.com",
  "Welcome to Hotbray",
  EMAIL_TEMPLATES.WELCOME,
  variables
);
```

## Available Features

The email service supports:

- ✅ Single and multiple recipients
- ✅ CC and BCC
- ✅ HTML templates with variable replacement
- ✅ File attachments
- ✅ Connection verification
- ✅ Error logging
- ✅ Microsoft Office 365 SMTP

## Integration Examples

Check `src/services/emailExamples.ts` for ready-to-use functions:

1. `sendOrderConfirmationEmail()` - Order confirmations
2. `sendWelcomeEmail()` - New user welcome
3. `sendPasswordResetEmail()` - Password reset
4. `sendOrderStatusUpdateEmail()` - Order status changes
5. `sendAdminNotification()` - Admin notifications
6. `sendInvoiceEmail()` - Emails with PDF attachments

## Next Steps

Now that the base setup is complete, you can:

1. Configure your SMTP credentials in `.env`
2. Test the email service with `bun run test:email`
3. Tell me which specific features you want to implement:
   - Order confirmation emails
   - Welcome emails for new users
   - Password reset emails
   - Order status updates
   - Custom notifications
   - Or any other email feature you need

## Documentation

For detailed usage instructions, see:
- `src/services/EMAIL_SERVICE_USAGE.md` - Complete usage guide with examples

## Troubleshooting

If you encounter issues:

1. **Connection failed**: Verify SMTP credentials and use app password
2. **Emails not delivered**: Check spam folder and Microsoft security settings
3. **Template errors**: Ensure variable names match exactly (case-sensitive)

For more troubleshooting tips, see the troubleshooting section in `EMAIL_SERVICE_USAGE.md`.
