/**
 * Email Service Integration Examples
 *
 * This file contains example functions showing how to integrate
 * the email service into different parts of your application.
 */

import { emailService } from "./emailService";
import { EMAIL_TEMPLATES, buildEmailVariables } from "@/utils/emailTemplates";

/**
 * Example 1: Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  customerEmail: string,
  orderNumber: string,
  customerName: string
) {
  const variables = buildEmailVariables({
    customerName,
    orderNumber,
    date: new Date().toLocaleDateString(),
  });

  return await emailService.sendTemplateEmail(
    customerEmail,
    `Order Confirmation - ${orderNumber}`,
    EMAIL_TEMPLATES.ORDER_CONFIRMATION,
    variables
  );
}

/**
 * Example 2: Send welcome email to new user
 */
export async function sendWelcomeEmail(
  userEmail: string,
  userName: string,
  dashboardUrl: string = "https://hotbray.com/dashboard"
) {
  const variables = buildEmailVariables({
    customerName: userName,
    message: "Thank you for joining Hotbray! We're excited to have you on board.",
    actionText: "Go to Dashboard",
    actionUrl: dashboardUrl,
    year: new Date().getFullYear().toString(),
  });

  return await emailService.sendTemplateEmail(
    userEmail,
    "Welcome to Hotbray!",
    EMAIL_TEMPLATES.WELCOME,
    variables
  );
}

/**
 * Example 3: Send password reset email
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetToken: string
) {
  const resetUrl = `${process.env.DOMAIN}/reset-password?token=${resetToken}`;

  const variables = buildEmailVariables({
    customerName: userName,
    message: "You requested to reset your password. Click the button below to create a new password. This link will expire in 1 hour.",
    actionText: "Reset Password",
    actionUrl: resetUrl,
    year: new Date().getFullYear().toString(),
  });

  return await emailService.sendTemplateEmail(
    userEmail,
    "Reset Your Password - Hotbray",
    EMAIL_TEMPLATES.WELCOME,
    variables
  );
}

/**
 * Example 4: Send order status update email
 */
export async function sendOrderStatusUpdateEmail(
  customerEmail: string,
  orderNumber: string,
  customerName: string,
  newStatus: string
) {
  const statusMessages: Record<string, string> = {
    processing: "Your order is now being processed.",
    shipped: "Great news! Your order has been shipped.",
    delivered: "Your order has been delivered successfully.",
    cancelled: "Your order has been cancelled as requested.",
  };

  const message = statusMessages[newStatus] || `Your order status has been updated to: ${newStatus}`;

  const variables = buildEmailVariables({
    customerName,
    message: `Order ${orderNumber} - ${message}`,
    actionText: "View Order Details",
    actionUrl: `${process.env.DOMAIN}/orders/${orderNumber}`,
    year: new Date().getFullYear().toString(),
  });

  return await emailService.sendTemplateEmail(
    customerEmail,
    `Order Update: ${orderNumber}`,
    EMAIL_TEMPLATES.WELCOME,
    variables
  );
}

/**
 * Example 5: Send notification to multiple admin users
 */
export async function sendAdminNotification(
  adminEmails: string[],
  subject: string,
  message: string
) {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #1e5a8e;">Admin Notification</h2>
      <p>${message}</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
      <p style="color: #666; font-size: 12px;">
        This is an automated notification from Hotbray system.
      </p>
    </div>
  `;

  return await emailService.sendEmail({
    to: adminEmails,
    subject: `[Admin] ${subject}`,
    html,
  });
}

/**
 * Example 6: Send email with PDF attachment (invoice, receipt, etc.)
 */
export async function sendInvoiceEmail(
  customerEmail: string,
  customerName: string,
  orderNumber: string,
  invoicePath: string
) {
  const variables = buildEmailVariables({
    customerName,
    message: `Please find attached the invoice for your order ${orderNumber}.`,
    actionText: "View Order",
    actionUrl: `${process.env.DOMAIN}/orders/${orderNumber}`,
    year: new Date().getFullYear().toString(),
  });

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Invoice for Order ${orderNumber}</h2>
      <p>Dear ${customerName},</p>
      <p>Thank you for your order. Please find your invoice attached to this email.</p>
    </div>
  `;

  return await emailService.sendEmail({
    to: customerEmail,
    subject: `Invoice - Order ${orderNumber}`,
    html,
    attachments: [
      {
        filename: `invoice-${orderNumber}.pdf`,
        path: invoicePath,
      },
    ],
  });
}

/**
 * Example 7: Integration in a Hono route
 *
 * Add this to your route file:
 *
 * import { sendWelcomeEmail } from "@/services/emailExamples";
 *
 * app.post("/register", async (c) => {
 *   const { email, firstName } = await c.req.json();
 *
 *   // ... create user in database ...
 *
 *   // Send welcome email (fire and forget or await based on your needs)
 *   sendWelcomeEmail(email, firstName).catch((error) => {
 *     console.error("Failed to send welcome email:", error);
 *   });
 *
 *   return c.json({ success: true });
 * });
 */
