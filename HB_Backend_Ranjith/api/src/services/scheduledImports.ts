import cron from "node-cron";
import { sharepointImportService } from "./sharepointImport";
import { SharePointImportTrigger } from "generated/prisma";

/**
 * Scheduled SharePoint Import Service
 * Runs automated imports from SharePoint folders at scheduled times
 */
class ScheduledImportsService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  /**
   * Start the cron job
   * By default runs at 2:00 AM every day
   * Schedule can be configured via SHAREPOINT_IMPORT_SCHEDULE env variable
   */
  start(): void {
    // Get schedule from env or default to 2:00 AM daily
    const schedule = process.env.SHAREPOINT_IMPORT_SCHEDULE || "0 2 * * *";

    console.log(`📅 Scheduling SharePoint imports: ${schedule} (${this.getCronDescription(schedule)})`);

    this.cronJob = cron.schedule(schedule, async () => {
      await this.runScheduledImport();
    });

    console.log("✅ SharePoint import scheduler started");
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("⏹️  SharePoint import scheduler stopped");
    }
  }

  /**
   * Check if import is currently running
   */
  isImportRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Manually trigger the import process
   */
  async triggerManualImport(): Promise<any> {
    if (this.isRunning) {
      throw new Error("Import is already running. Please wait for it to complete.");
    }

    console.log("🔧 Manual import triggered");
    return await this.runScheduledImport(SharePointImportTrigger.MANUAL);
  }

  /**
   * Run the scheduled import process
   */
  private async runScheduledImport(trigger: SharePointImportTrigger = SharePointImportTrigger.CRON): Promise<any> {
    if (this.isRunning) {
      console.warn("⚠️  Import already running, skipping this scheduled run");
      return { skipped: true, reason: "Import already in progress" };
    }

    this.isRunning = true;

    try {
      console.log("\n" + "=".repeat(60));
      console.log(`🕐 SHAREPOINT IMPORT STARTED (${trigger})`);
      console.log("=".repeat(60));

      const result = await sharepointImportService.runImport(trigger);

      console.log("=".repeat(60));
      console.log("✅ SCHEDULED SHAREPOINT IMPORT COMPLETED");
      console.log("=".repeat(60) + "\n");

      return result;
    } catch (error: any) {
      console.error("❌ Scheduled import failed:", error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get human-readable description of cron schedule
   */
  private getCronDescription(schedule: string): string {
    const descriptions: { [key: string]: string } = {
      "0 2 * * *": "Daily at 2:00 AM",
      "0 0 * * *": "Daily at midnight",
      "0 3 * * *": "Daily at 3:00 AM",
      "0 */6 * * *": "Every 6 hours",
      "0 */12 * * *": "Every 12 hours",
    };

    return descriptions[schedule] || "Custom schedule";
  }
}

// Export singleton instance
export const scheduledImportsService = new ScheduledImportsService();
