import { BaseEmail } from "./baseEmail";
import {
  formatDate,
  loadTemplate,
} from "./emailHelpers";
import type { EmailType } from "generated/prisma";

/**
 * Contact Enquiry Admin Notification Data
 */
export interface ContactEnquiryAdminData {
  name: string;
  email: string;
  phone: string;
  message: string;
  submittedAt: Date;
  adminEmail: string;
}

/**
 * Contact Enquiry Admin Notification Email Handler
 */
export class ContactEnquiryAdminEmail extends BaseEmail<ContactEnquiryAdminData> {
  protected emailType: EmailType = "OTHER";

  protected generateSubject(data: ContactEnquiryAdminData): string {
    return `New Contact Enquiry from ${data.name}`;
  }

  protected getRecipient(data: ContactEnquiryAdminData): string {
    return data.adminEmail;
  }

  protected getMetadata(data: ContactEnquiryAdminData): Record<string, any> {
    return {
      contactName: data.name,
      contactEmail: data.email,
      contactPhone: data.phone,
      recipient: "admin",
    };
  }

  protected generateHTML(data: ContactEnquiryAdminData): string {
    // Load template
    let html = loadTemplate("contact_enquiry_admin.html");

    // Format date
    const formattedDate = formatDate(data.submittedAt);

    // Replace placeholders
    html = html.replace(/{{NAME}}/g, data.name);
    html = html.replace(/{{EMAIL}}/g, data.email);
    html = html.replace(/{{PHONE}}/g, data.phone);
    html = html.replace(/{{MESSAGE}}/g, this.escapeHtml(data.message));
    html = html.replace(/{{DATE_TIME}}/g, formattedDate);
    html = html.replace(/@ 2026 Hotbray/g, `@ ${new Date().getFullYear()} Hotbray`);

    return html;
  }

  protected generateText(data: ContactEnquiryAdminData): string {
    const formattedDate = formatDate(data.submittedAt);

    return `New Contact Enquiry from ${data.name}

Hello Admin Team,

A new contact enquiry has been submitted through the dealer portal.

Contact Details:
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Date: ${formattedDate}

Message:
${data.message}

Please respond to this enquiry at your earliest convenience.`;
  }

  /**
   * Escape HTML special characters in text
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m] || m);
  }
}

// Export singleton instance
export const contactEnquiryAdminEmail = new ContactEnquiryAdminEmail();
