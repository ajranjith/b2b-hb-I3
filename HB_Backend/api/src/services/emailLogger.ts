import { prisma } from "@/lib/prisma";
import type { EmailType, EmailStatus } from "generated/prisma";

/**
 * Email Log Entry
 */
export interface EmailLogEntry {
  type: EmailType;
  recipient: string;
  subject: string;
  status: EmailStatus;
  errorMessage?: string;
  metadata?: Record<string, any>;
  relatedOrderId?: number;
  relatedUserId?: number;
}

/**
 * Email Logger Service - Handles database logging of email attempts
 */
export class EmailLogger {
  /**
   * Log email attempt to database
   */
  async log(entry: EmailLogEntry): Promise<void> {
    try {
      await prisma.emailLog.create({
        data: {
          type: entry.type,
          recipient: entry.recipient,
          subject: entry.subject,
          emailStatus: entry.status,
          errorMessage: entry.errorMessage || null,
          relatedOrderId: entry.relatedOrderId || null,
          relatedUserId: entry.relatedUserId || null,
          metadata: entry.metadata ? (entry.metadata as any) : null,
          sentAt: entry.status === "SENT" ? new Date() : null,
        },
      });
    } catch (error) {
      console.error("Failed to log email to database:", error);
    }
  }

  /**
   * Log pending email
   */
  async logPending(
    type: EmailType,
    recipient: string,
    subject: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type,
      recipient,
      subject,
      status: "PENDING",
      metadata,
    });
  }

  /**
   * Log successful email send
   */
  async logSuccess(
    type: EmailType,
    recipient: string,
    subject: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type,
      recipient,
      subject,
      status: "SENT",
      metadata,
    });
  }

  /**
   * Log failed email send
   */
  async logFailure(
    type: EmailType,
    recipient: string,
    subject: string,
    errorMessage: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type,
      recipient,
      subject,
      status: "FAILED",
      errorMessage,
      metadata,
    });
  }
}

// Export singleton instance
export const emailLogger = new EmailLogger();
