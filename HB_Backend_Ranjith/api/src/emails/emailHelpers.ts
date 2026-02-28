import dayjs from "dayjs";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Format currency with symbol
 */
export function formatCurrency(amount: number, currency: string = "GBP"): string {
  const symbols: Record<string, string> = {
    GBP: "£",
    USD: "$",
    EUR: "€",
  };

  const symbol = symbols[currency] || currency;
  return `${symbol} ${amount.toFixed(2)}`;
}

/**
 * Format date in readable format
 */
export function formatDate(date: Date, format: string = "MMMM D, YYYY"): string {
  return dayjs(date).format(format);
}

/**
 * Format order status for display
 */
export function formatOrderStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Get status badge styling
 */
export interface StatusBadgeStyle {
  backgroundColor: string;
  color: string;
  text: string;
}

export function getStatusBadgeStyle(status: string): StatusBadgeStyle {
  const statusMap: Record<string, StatusBadgeStyle> = {
    PROCESSING: { backgroundColor: "#FAF3EE", color: "#DB5F00", text: "Processing" },
    CREATED: { backgroundColor: "#E3F2FD", color: "#1976D2", text: "Created" },
    BACKORDER: { backgroundColor: "#FFF3E0", color: "#F57C00", text: "Backorder" },
    READY_FOR_SHIPMENT: { backgroundColor: "#E8F5E9", color: "#388E3C", text: "Ready for Shipment" },
    FULLFILLED: { backgroundColor: "#E8F5E9", color: "#2E7D32", text: "Fulfilled" },
    CANCELLED: { backgroundColor: "#FFEBEE", color: "#C62828", text: "Cancelled" },
  };

  return statusMap[status] || { backgroundColor: "#F5F5F5", color: "#666666", text: status };
}

/**
 * Load email template from file
 */
export function loadTemplate(templatePath: string): string {
  const fullPath = join(process.cwd(), "src", "templates", "email", templatePath);
  return readFileSync(fullPath, "utf-8");
}

/**
 * Replace variables in template
 */
export function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Replace content between HTML tags or comment placeholders
 */
export function replaceTableRows(html: string, rowsHtml: string): string {
  // First try to replace using comment placeholders
  const placeholderStart = "<!-- PRODUCT_ROWS_PLACEHOLDER -->";
  const placeholderEnd = "<!-- END_PRODUCT_ROWS_PLACEHOLDER -->";

  const startIndex = html.indexOf(placeholderStart);
  const endIndex = html.indexOf(placeholderEnd);

  if (startIndex !== -1 && endIndex !== -1) {
    const beforePlaceholder = html.substring(0, startIndex + placeholderStart.length);
    const afterPlaceholder = html.substring(endIndex);
    return beforePlaceholder + "\n" + rowsHtml + "\n                                " + afterPlaceholder;
  }

  // Fallback to tbody tags for backward compatibility
  const tbodyStart = html.indexOf("<tbody>");
  const tbodyEnd = html.indexOf("</tbody>");

  if (tbodyStart !== -1 && tbodyEnd !== -1) {
    const beforeTbody = html.substring(0, tbodyStart + 7);
    const afterTbody = html.substring(tbodyEnd);
    return beforeTbody + rowsHtml + afterTbody;
  }

  return html;
}
