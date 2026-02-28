/**
 * Email Facade - Public API for sending emails
 *
 * This file provides a simple interface for sending emails while maintaining
 * backward compatibility with existing code.
 */

import { orderConfirmationEmail, type OrderConfirmationData } from "@/emails/orderConfirmation";
import { passwordResetEmail, type PasswordResetData } from "@/emails/passwordReset";
import { dealerWelcomeEmail, type DealerWelcomeData } from "@/emails/dealerWelcome";
import { adminOrderNotificationEmail, type AdminOrderNotificationData } from "@/emails/orderNotificationAdmin";
import { contactEnquiryAdminEmail, type ContactEnquiryAdminData } from "@/emails/contactInquiryAdmin";

/**
 * Send order confirmation email to dealer
 *
 * @param data - Order confirmation data
 */
export async function sendOrderConfirmationEmail(data: OrderConfirmationData): Promise<void> {
  await orderConfirmationEmail.send(data);
}

/**
 * Send password reset/change confirmation email
 *
 * @param data - Password reset data
 */
export async function sendPasswordResetEmail(data: PasswordResetData): Promise<void> {
  await passwordResetEmail.send(data);
}

/**
 * Send dealer welcome email with temporary password
 *
 * @param data - Dealer welcome data
 */
export async function sendDealerWelcomeEmail(data: DealerWelcomeData): Promise<void> {
  await dealerWelcomeEmail.send(data);
}

/**
 * Send order notification email to admin
 *
 * @param data - Admin order notification data
 */
export async function sendAdminOrderNotificationEmail(data: AdminOrderNotificationData): Promise<void> {
  await adminOrderNotificationEmail.send(data);
}

/**
 * Send contact inquiry notification email to admin
 *
 * @param data - Contact inquiry admin notification data
 */
export async function sendContactInquiryAdminEmail(data: ContactEnquiryAdminData): Promise<void> {
  await contactEnquiryAdminEmail.send(data);
}

// Re-export types for convenience
export type { OrderConfirmationData, OrderItem } from "@/emails/orderConfirmation";
export type { PasswordResetData } from "@/emails/passwordReset";
export type { DealerWelcomeData } from "@/emails/dealerWelcome";
export type { AdminOrderNotificationData } from "@/emails/orderNotificationAdmin";
export type { ContactEnquiryAdminData } from "@/emails/contactInquiryAdmin";
