import { BaseEmail } from "./baseEmail";
import { loadTemplate, replaceVariables } from "./emailHelpers";
import type { EmailType } from "generated/prisma";

/**
 * Dealer Welcome Email Data
 */
export interface DealerWelcomeData {
  email: string;
  userName: string;
  tempPassword: string;
  loginUrl?: string;
}

/**
 * Dealer Welcome Email Handler
 */
export class DealerWelcomeEmail extends BaseEmail<DealerWelcomeData> {
  protected emailType: EmailType = "WELCOME";

  protected generateSubject(data: DealerWelcomeData): string {
    return "Welcome to Hotbray - Your Dealer Account is Ready";
  }

  protected getRecipient(data: DealerWelcomeData): string {
    return data.email;
  }

  protected getMetadata(data: DealerWelcomeData): Record<string, any> {
    return {
      email: data.email,
      userName: data.userName,
    };
  }

  protected generateHTML(data: DealerWelcomeData): string {
    // Load template
    let html = loadTemplate("dealer_welcome.html");

    // Prepare variables
    const currentYear = new Date().getFullYear();
    const variables: Record<string, string> = {
      userName: data.userName,
      email: data.email,
      tempPassword: data.tempPassword,
      loginUrl: data.loginUrl || "#",
      year: currentYear.toString(),
    };

    // Replace template variables
    html = replaceVariables(html, variables);

    return html;
  }

  protected generateText(data: DealerWelcomeData): string {
    return `Welcome to Hotbray, ${data.userName}!

Your dealer account has been successfully created. You can now access the Hotbray platform using your credentials below.

Email: ${data.email}
Temporary Password: ${data.tempPassword}

Important: Please change your password after your first login for security purposes.

Use these credentials to log in to your account and start exploring our range of products.

${data.loginUrl ? `Login URL: ${data.loginUrl}` : ""}

© ${new Date().getFullYear()} Hotbray. All rights reserved.`;
  }
}

// Export singleton instance
export const dealerWelcomeEmail = new DealerWelcomeEmail();
