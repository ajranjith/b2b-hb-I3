import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP Configuration Interface
 */
interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  auth?: {
    user: string;
    pass: string;
  };
  requireTLS?: boolean;
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  tls?: {
    rejectUnauthorized: boolean;
    minVersion?: string;
  };
}

/**
 * Email Send Options
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer | string;
  }>;
}

/**
 * Email Send Result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  smtpHost?: string;
}

/**
 * Core Email Service - Handles SMTP configuration and email sending
 */
export class EmailService {
  private config: SMTPConfig;
  private smtpUser?: string;
  private smtpPassword?: string;

  constructor() {
    this.config = this.buildSMTPConfig();
  }

  /**
   * Build SMTP configuration from environment variables
   */
  private buildSMTPConfig(): SMTPConfig {
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPassword = process.env.SMTP_PASSWORD;
    let smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";

    // Detect Microsoft account
    const isMicrosoftAccount = this.isMicrosoftAccount(this.smtpUser, smtpHost);

    // Auto-detect and set correct SMTP host for Microsoft accounts
    if (isMicrosoftAccount && (!smtpHost || smtpHost.includes("gmail"))) {
      smtpHost = "smtp.office365.com";
      console.log(`Detected Microsoft account, using SMTP host: ${smtpHost}`);
    }

    // Default to Gmail if no host specified
    if (!smtpHost) {
      smtpHost = "smtp.gmail.com";
    }

    const config: SMTPConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      from: process.env.SMTP_FROM || this.smtpUser || "noreply@hotbray.com",
      auth:
        this.smtpUser && this.smtpPassword
          ? {
              user: this.smtpUser,
              pass: this.smtpPassword,
            }
          : undefined,
    };

    // console.log("SMTP Configuration:", config);

    // Apply provider-specific configurations
    if (isMicrosoftAccount) {
      // Object.assign(config, {
      //   requireTLS: true,
      //   connectionTimeout: 60000,
      //   greetingTimeout: 30000,
      //   socketTimeout: 60000,
      //   tls: {
      //     rejectUnauthorized: false,
      //     minVersion: "TLSv1.2",
      //   },
      // });
    } else {
      config.tls = {
        rejectUnauthorized: false,
      };
    }

    return config;
  }

  /**
   * Check if account is Microsoft/Outlook
   */
  private isMicrosoftAccount(user?: string, host?: string): boolean {
    return !!(
      user?.includes("@outlook.com") ||
      user?.includes("@hotmail.com") ||
      user?.includes("@live.com") ||
      user?.includes("@dgstechlimited.com") ||
      user?.includes("@vishgyana.com") ||
      host?.includes("outlook") ||
      host?.includes("office365")
    );
  }

  /**
   * Get retry configuration
   */
  private getRetryConfig() {
    return {
      maxRetries: 3, // Number of retry attempts
      retryDelay: 1000, // Delay between retries in ms
    };
  }

  /**
   * Sleep helper for retry delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create transporter with given host
   */
  private createTransporter(host: string): Transporter {
    const config = { ...this.config, host };
    return nodemailer.createTransport(config);
  }

  /**
   * Check if SMTP credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.smtpUser && this.smtpPassword);
  }

  /**
   * Get configured from address
   */
  getFromAddress(): string {
    return this.config.from;
  }

  /**
   * Send email with retry logic (retries on same host for transient failures)
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "SMTP credentials not configured",
      };
    }

    const { maxRetries, retryDelay } = this.getRetryConfig();
    const smtpHost = this.config.host;
    let lastError: any = null;

    // Retry on the same SMTP host
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            `Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms delay...`,
          );
          await this.sleep(retryDelay);
        } else {
          console.log(`Attempting to send email via ${smtpHost}...`);
        }

        const transporter = this.createTransporter(smtpHost);

        // Verify connection (optional, continue if fails)
        try {
          await transporter.verify();
          console.log(`SMTP server ${smtpHost} connection verified`);
        } catch (verifyError: any) {
          console.warn(
            `SMTP verification failed for ${smtpHost}:`,
            verifyError.message,
          );
        }

        // Prepare mail options
        const mailOptions = {
          from: options.from || `"Hotbray" <${this.config.from}>`,
          to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          cc: options.cc
            ? Array.isArray(options.cc)
              ? options.cc.join(", ")
              : options.cc
            : undefined,
          bcc: options.bcc
            ? Array.isArray(options.bcc)
              ? options.bcc.join(", ")
              : options.bcc
            : undefined,
          attachments: options.attachments,
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(
          `Email sent successfully via ${smtpHost}. Message ID: ${info.messageId}`,
        );

        return {
          success: true,
          messageId: info.messageId,
          smtpHost,
        };
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable (transient network/server errors)
        const isRetryable = this.isRetryableError(error);

        if (isRetryable && attempt < maxRetries) {
          console.warn(
            `Attempt ${attempt}/${maxRetries} failed with retryable error:`,
            error.message,
          );
          continue; // Retry
        } else {
          console.error(
            `Attempt ${attempt}/${maxRetries} failed with non-retryable error:`,
            error.message,
          );
          break; // Don't retry on auth errors, permanent failures
        }
      }
    }

    // All attempts failed
    const error = lastError;
    return {
      success: false,
      error: `${error.code || "ERROR"}: ${error.message}`,
    };
  }

  /**
   * Check if error is retryable (transient failure)
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      "ETIMEDOUT", // Connection timeout
      "ECONNREFUSED", // Connection refused
      "ECONNRESET", // Connection reset
      "ENOTFOUND", // DNS lookup failed
      "ENETUNREACH", // Network unreachable
      "EAI_AGAIN", // DNS temporary failure
    ];

    const retryableResponseCodes = [
      421, // Service not available (temporary)
      450, // Mailbox unavailable (temporary)
      451, // Local error in processing
      452, // Insufficient system storage
    ];

    // Don't retry authentication failures
    if (error.code === "EAUTH" || error.responseCode === 535) {
      return false;
    }

    // Retry network/connection errors
    if (retryableCodes.includes(error.code)) {
      return true;
    }

    // Retry temporary SMTP errors
    if (retryableResponseCodes.includes(error.responseCode)) {
      return true;
    }

    return false;
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      console.error("Email service not configured");
      return false;
    }

    try {
      const transporter = this.createTransporter(this.config.host);
      await transporter.verify();
      console.log("SMTP connection verified successfully");
      return true;
    } catch (error) {
      console.error("SMTP connection verification failed:", error);
      return false;
    }
  }

  /**
   * Send template-based email (backward compatibility)
   */
  async sendTemplateEmail(
    to: string | string[],
    subject: string,
    templatePath: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    try {
      const { readFileSync } = await import("fs");
      let htmlContent = readFileSync(templatePath, "utf-8");

      // Replace variables
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, "g");
        htmlContent = htmlContent.replace(regex, value);
      }

      const result = await this.sendEmail({
        to,
        subject,
        html: htmlContent,
      });

      return result.success;
    } catch (error) {
      console.error("Failed to send template email:", error);
      return false;
    }
  }

  // /**
  //  * Log configuration (for debugging)
  //  */
  // logConfig(): void {
  //   console.log("SMTP Configuration:", {
  //     host: this.config.host,
  //     port: this.config.port,
  //     secure: this.config.secure,
  //     user: this.smtpUser,
  //     from: this.config.from,
  //     isMicrosoft: this.isMicrosoftAccount(this.smtpUser, this.config.host),
  //     requireTLS: this.config.requireTLS,
  //   });
  // }
}

// Export singleton instance
export const emailService = new EmailService();
