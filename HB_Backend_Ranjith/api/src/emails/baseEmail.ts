import { emailService, type EmailOptions } from "@/services/emailService";
import { emailLogger } from "@/services/emailLogger";
import type { EmailType } from "generated/prisma";

/**
 * Base Email Handler - Abstract class for all email types
 */
export abstract class BaseEmail<T = any> {
  protected abstract emailType: EmailType;

  /**
   * Generate email subject
   */
  protected abstract generateSubject(data: T): string;

  /**
   * Generate email HTML content
   */
  protected abstract generateHTML(data: T): string;

  /**
   * Generate email text content (optional)
   */
  protected generateText?(data: T): string;

  /**
   * Get recipient email from data
   */
  protected abstract getRecipient(data: T): string;

  /**
   * Get metadata for logging
   */
  protected abstract getMetadata(data: T): Record<string, any>;

  /**
   * Send email (non-blocking with database logging)
   */
  async send(data: T): Promise<void> {
    const recipient = this.getRecipient(data);
    const subject = this.generateSubject(data);
    const metadata = this.getMetadata(data);

    // Log pending email immediately
    await emailLogger.logPending(this.emailType, recipient, subject, metadata);

    // Send email asynchronously (non-blocking)
    setImmediate(async () => {
      await this.sendAsync(data, recipient, subject, metadata);
    });
  }

  /**
   * Internal async send method
   */
  private async sendAsync(
    data: T,
    recipient: string,
    subject: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // Check if email service is configured
      if (!emailService.isConfigured()) {
        const errorMsg = "SMTP credentials not configured";
        console.warn(`${errorMsg}. Email would have been sent to ${recipient}`);
        await emailLogger.logFailure(this.emailType, recipient, subject, errorMsg, metadata);
        return;
      }

      // Generate email content
      const html = this.generateHTML(data);
      const text = this.generateText ? this.generateText(data) : undefined;

      // Prepare email options
      const emailOptions: EmailOptions = {
        to: recipient,
        subject,
        html,
        text,
      };

      // Send email
      const result = await emailService.sendEmail(emailOptions);

      if (result.success) {
        // Log success
        await emailLogger.logSuccess(this.emailType, recipient, subject, {
          ...metadata,
          messageId: result.messageId,
          smtpHost: result.smtpHost,
        });
      } else {
        // Log failure
        await emailLogger.logFailure(
          this.emailType,
          recipient,
          subject,
          result.error || "Unknown error",
          metadata
        );
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to send ${this.emailType} email:`, errorMessage);
      await emailLogger.logFailure(this.emailType, recipient, subject, errorMessage, metadata);
    }
  }
}
