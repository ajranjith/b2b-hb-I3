import { BaseEmail } from "./baseEmail";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeStyle,
  loadTemplate,
  replaceTableRows,
} from "./emailHelpers";
import type { EmailType } from "generated/prisma";

/**
 * Order Item Interface
 */
export interface OrderItem {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Admin Order Notification Data
 */
export interface AdminOrderNotificationData {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: Date;
  itemCount: number;
  totalAmount: number;
  currency: string;
  billingFirstName: string;
  billingLastName: string;
  billingEmail: string;
  billingCompanyName?: string | null;
  billingOrderNo?: string | null;
  notes?: string | null;
  shippingMethod: string;
  items: OrderItem[];
  adminEmail: string;
}

/**
 * Admin Order Notification Email Handler
 */
export class AdminOrderNotificationEmail extends BaseEmail<AdminOrderNotificationData> {
  protected emailType: EmailType = "ORDER_CONFIRMATION";

  protected generateSubject(data: AdminOrderNotificationData): string {
    return `New Order Received - ${data.orderNumber}`;
  }

  protected getRecipient(data: AdminOrderNotificationData): string {
    return data.adminEmail;
  }

  protected getMetadata(data: AdminOrderNotificationData): Record<string, any> {
    return {
      orderNumber: data.orderNumber,
      itemCount: data.itemCount,
      totalAmount: data.totalAmount,
      currency: data.currency,
      recipient: "admin",
    };
  }

  protected generateHTML(data: AdminOrderNotificationData): string {
    // Load template
    let html = loadTemplate("order_notification_admin.html");

    // Format data
    const formattedDate = formatDate(data.orderDate);
    const formattedTotal = formatCurrency(data.totalAmount, data.currency);
    const billingName = `${data.billingFirstName} ${data.billingLastName}`;
    const billingCompany = data.billingCompanyName || '';

    // Calculate subtotal (same as total for now)
    const subtotal = data.totalAmount;
    const formattedSubtotal = formatCurrency(subtotal, data.currency);

    // Generate product rows
    const productRows = this.generateProductRows(data.items, data.currency);

    // Replace placeholders in template
    html = html.replace(/{{orderNumber}}/g, data.orderNumber);
    html = html.replace(/{{orderDate}}/g, formattedDate);
    html = html.replace(/{{email}}/g, data.billingEmail);
    html = html.replace(/{{total}}/g, formattedTotal);
    html = html.replace(/{{subtotal}}/g, formattedSubtotal);
    html = html.replace(/{{dealerOrderNumber}}/g, data.billingOrderNo || data.orderNumber);
    html = html.replace(/{{dispatchMethod}}/g, data.shippingMethod);
    html = html.replace(/{{orderNotes}}/g, data.notes || '-');
    html = html.replace(/{{billingName}}/g, billingName);
    html = html.replace(/{{billingCompany}}/g, billingCompany);
    html = html.replace(/{{billingEmail}}/g, data.billingEmail);
    html = html.replace(/{{year}}/g, new Date().getFullYear().toString());

    // Replace product rows
    html = replaceTableRows(html, productRows);

    return html;
  }

  protected generateText(data: AdminOrderNotificationData): string {
    const formattedDate = formatDate(data.orderDate);
    const itemsList = data.items
      .map((item) => `- ${item.productCode}: ${item.productName} (Qty: ${item.quantity})`)
      .join("\n");

    return `New Order Received - ${data.orderNumber}

Hello Admin Team,

A new order has been successfully placed on the platform.

Order Date: ${formattedDate}
Customer: ${data.billingFirstName} ${data.billingLastName}
Email: ${data.billingEmail}
Total: ${data.currency} ${data.totalAmount.toFixed(2)}

Items:
${itemsList}

Please review and process this order in the admin dashboard.`;
  }

  /**
   * Generate product table rows HTML
   */
  private generateProductRows(items: OrderItem[], currency: string): string {
    return items
      .map((item) => {
        const itemTotal = item.unitPrice * item.quantity;
        const formattedItemTotal = formatCurrency(itemTotal, currency);
        return `
                <tr>
                    <td style="padding: 12px 16px; border: 1px solid #e0e0e0; border-bottom: none; border-top: none;">
                        <p style="margin: 0; font-size: 14px; color: #000000; font-family: 'DM Sans', sans-serif;">${item.productCode} × ${item.quantity}</p>
                    </td>
                    <td align="right" style="padding: 12px 16px; border: 1px solid #e0e0e0; border-bottom: none; border-left: none; border-top: none;">
                        <p style="margin: 0; font-size: 14px; color: #000000; font-family: 'DM Sans', sans-serif;">${formattedItemTotal}</p>
                    </td>
                </tr>`;
      })
      .join("");
  }
}

// Export singleton instance
export const adminOrderNotificationEmail = new AdminOrderNotificationEmail();
