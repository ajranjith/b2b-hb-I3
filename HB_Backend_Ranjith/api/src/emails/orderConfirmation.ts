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
 * Order Confirmation Email Data
 */
export interface OrderConfirmationData {
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
}

/**
 * Order Confirmation Email Handler
 */
export class OrderConfirmationEmail extends BaseEmail<OrderConfirmationData> {
  protected emailType: EmailType = "ORDER_CONFIRMATION";

  protected generateSubject(data: OrderConfirmationData): string {
    return `Order Confirmation - ${data.orderNumber}`;
  }

  protected getRecipient(data: OrderConfirmationData): string {
    return data.billingEmail;
  }

  protected getMetadata(data: OrderConfirmationData): Record<string, any> {
    return {
      orderNumber: data.orderNumber,
      itemCount: data.itemCount,
      totalAmount: data.totalAmount,
      currency: data.currency,
    };
  }

  protected generateHTML(data: OrderConfirmationData): string {
    // Load template
    let html = loadTemplate("order_confirmation_dealer/index.html");

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
    html = html.replace(/{{purchaseOrderNumber}}/g, data.billingOrderNo || '-');
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

  protected generateText(data: OrderConfirmationData): string {
    const formattedDate = formatDate(data.orderDate);
    const itemsList = data.items
      .map((item) => `- ${item.productCode}: ${item.productName} (Qty: ${item.quantity})`)
      .join("\n");

    return `Thank you for your order!

Your order ${data.orderNumber} has been confirmed and is currently under review.

Order Date: ${formattedDate}
Total: ${data.currency} ${data.totalAmount.toFixed(2)}

Items:
${itemsList}

For any assistance, feel free to contact our support team.`;
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
                        <p style="margin: 0; font-size: 14px; color: #000000; font-family: 'DM Sans', sans-serif;">${item.productCode}</p>
                    </td>
                    <td align="center" style="padding: 12px 16px; border: 1px solid #e0e0e0; border-bottom: none; border-left: none; border-top: none;">
                        <p style="margin: 0; font-size: 14px; color: #000000; font-family: 'DM Sans', sans-serif;">${item.quantity}</p>
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
export const orderConfirmationEmail = new OrderConfirmationEmail();
