/**
 * Email Utility - Main entry point for email functionality
 *
 * This file provides backward compatibility while using the new modular email system.
 *
 * Architecture:
 * - src/services/emailService.ts - Core SMTP service
 * - src/services/emailLogger.ts - Database logging
 * - src/emails/baseEmail.ts - Base email handler class
 * - src/emails/orderConfirmation.ts - Order confirmation email handler
 * - src/emails/emailHelpers.ts - Formatting utilities
 */

// Re-export everything from the facade
export { sendOrderConfirmationEmail, sendAdminOrderNotificationEmail } from "./emailFacade";
export type { OrderConfirmationData, OrderItem, AdminOrderNotificationData } from "./emailFacade";

// Also export the core services for direct use if needed
export { emailService } from "@/services/emailService";
export { emailLogger } from "@/services/emailLogger";
