import { BaseEmail } from "./baseEmail";
import { loadTemplate, replaceVariables } from "./emailHelpers";
import type { EmailType } from "generated/prisma";

/**
 * Password Reset Email Data
 */
export interface PasswordResetData {
  email: string;
  userName: string;
  actionUrl: string;
}

/**
 * Password Reset Email Handler
 */
export class PasswordResetEmail extends BaseEmail<PasswordResetData> {
  protected emailType: EmailType = "PASSWORD_RESET";

  protected generateSubject(data: PasswordResetData): string {
    return "Password Change Confirmation - Hotbray";
  }

  protected getRecipient(data: PasswordResetData): string {
    return data.email;
  }

  protected getMetadata(data: PasswordResetData): Record<string, any> {
    return {
      email: data.email,
      userName: data.userName,
    };
  }

  protected generateHTML(data: PasswordResetData): string {
    // Load template
    let html = loadTemplate("password_change_confirmation.html");

    // Prepare variables
    const currentYear = new Date().getFullYear();
    const variables: Record<string, string> = {
      userName: data.userName,
      actionUrl: data.actionUrl,
      year: currentYear.toString(),
    };

    // Replace template variables
    html = replaceVariables(html, variables);

    return html;
  }

  protected generateText(data: PasswordResetData): string {
    return `Hello ${data.userName},

Are you sure you want to change your password?

If you did not request this password change, please ignore this email or contact support immediately.

To confirm your password change, please visit: ${data.actionUrl}

© ${new Date().getFullYear()} Hotbray. All rights reserved.`;
  }
}

// Export singleton instance
export const passwordResetEmail = new PasswordResetEmail();
