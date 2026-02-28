# Email Service Usage Guide

This guide explains how to use the email notification service with nodemailer and Microsoft SMTP.

## Configuration

### Environment Variables

Make sure the following environment variables are set in your `.env` file:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@hotbray.com
```

### Microsoft Account Setup

For Microsoft/Office 365 accounts:

1. Go to your Microsoft account security settings
2. Enable 2-factor authentication if not already enabled
3. Generate an app password (not your regular password)
4. Use this app password in `SMTP_PASSWORD`

**Note:** Regular passwords won't work with SMTP. You must use an app-specific password.

## Basic Usage

### Import the Service

```typescript
import { emailService } from "@/services/email";
import { EMAIL_TEMPLATES, buildEmailVariables } from "@/utils/emailTemplates";
```

### Send a Simple Email

```typescript
const sent = await emailService.sendEmail({
  to: "user@example.com",
  subject: "Hello from Hotbray",
  html: "<h1>Hello!</h1><p>This is a test email.</p>",
});

if (sent) {
  console.log("Email sent successfully");
}
```

### Send to Multiple Recipients

```typescript
await emailService.sendEmail({
  to: ["user1@example.com", "user2@example.com"],
  subject: "Notification",
  html: "<p>This email goes to multiple recipients.</p>",
  cc: "manager@example.com",
  bcc: ["admin@example.com", "archive@example.com"],
});
```

### Send Email with Attachments

```typescript
await emailService.sendEmail({
  to: "user@example.com",
  subject: "Your Invoice",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [
    {
      filename: "invoice.pdf",
      path: "/path/to/invoice.pdf",
    },
  ],
});
```

### Send Template-Based Email

```typescript
const variables = buildEmailVariables({
  customerName: "John Doe",
  message: "Welcome to our platform!",
  actionText: "Get Started",
  actionUrl: "https://hotbray.com/dashboard",
  year: new Date().getFullYear().toString(),
});

await emailService.sendTemplateEmail(
  "user@example.com",
  "Welcome to Hotbray",
  EMAIL_TEMPLATES.WELCOME,
  variables
);
```

## Available Templates

Currently available email templates:

- `EMAIL_TEMPLATES.ORDER_CONFIRMATION` - Order confirmation email
- `EMAIL_TEMPLATES.WELCOME` - Welcome email template

## Testing the Email Service

Run the test script to verify your email configuration:

```bash
TEST_EMAIL=your-test-email@example.com bun run src/scripts/testEmail.ts
```

## Utility Methods

### Verify Connection

```typescript
const isConnected = await emailService.verifyConnection();
if (isConnected) {
  console.log("SMTP connection is working");
}
```

### Check Configuration Status

```typescript
if (emailService.isConfigured()) {
  console.log("Email service is ready to use");
}
```

### Get From Address

```typescript
const fromAddress = emailService.getFromAddress();
console.log(`Emails will be sent from: ${fromAddress}`);
```

## Creating New Email Templates

1. Create a new HTML file in `src/templates/email/`
2. Use template variables with `{{variableName}}` syntax
3. Add the template to `src/utils/emailTemplates.ts`:

```typescript
export const EMAIL_TEMPLATES = {
  // ... existing templates
  YOUR_TEMPLATE: join(
    __dirname,
    "..",
    "templates",
    "email",
    "your-template.html"
  ),
} as const;
```

## Error Handling

The email service logs errors to the console. In production, you should implement proper error handling:

```typescript
try {
  const sent = await emailService.sendEmail({
    to: "user@example.com",
    subject: "Test",
    html: "<p>Test</p>",
  });

  if (!sent) {
    // Handle send failure
    console.error("Failed to send email");
  }
} catch (error) {
  // Handle unexpected errors
  console.error("Email error:", error);
}
```

## Best Practices

1. Always use environment variables for SMTP credentials
2. Never commit `.env` file to version control
3. Use app-specific passwords for Microsoft accounts
4. Test email delivery in development before production
5. Implement rate limiting for email sends
6. Use templates for consistent branding
7. Include unsubscribe links for marketing emails
8. Keep email content concise and mobile-friendly

## Troubleshooting

### Connection Failed

- Verify SMTP credentials are correct
- Check if you're using an app password (not regular password)
- Ensure port 587 is not blocked by firewall
- Try with `SMTP_SECURE=true` and port 465

### Emails Not Delivered

- Check spam folder
- Verify the sender email is authorized to send from your domain
- Check Microsoft account security settings
- Review SMTP server logs

### Template Variables Not Replaced

- Ensure variable names match exactly (case-sensitive)
- Use `buildEmailVariables()` to sanitize variables
- Check template syntax uses `{{variableName}}`
