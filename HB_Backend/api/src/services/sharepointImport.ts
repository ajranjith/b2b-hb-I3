import { sharePointService } from "./sharepoint";
import { prisma } from "@/lib/prisma";
import { ImportType, ImportSource, SharePointImportTrigger, SharePointImportRunStatus } from "generated/prisma";
import { importDealers } from "@/modules/import/_services";
import { importProducts } from "@/modules/import/_services.products";
import { importSuperseded } from "@/modules/import/_services.superseded";
import { importBackOrders } from "@/modules/import/_services.backorder";
import { importOrderStatus } from "@/modules/import/_services.orderstatus";
import { uploadAndSaveImportFile } from "@/modules/import/_utils";

interface ImportFolderConfig {
  type: ImportType;
  folderId: string;
  priority: number;
}

interface ProcessResult {
  type: ImportType;
  foundCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

interface SharePointImportResult {
  success: boolean;
  totalProcessed: number;
  results: ProcessResult[];
  errors: string[];
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

class SharePointImportService {
  private importFolders: ImportFolderConfig[] = [];

  constructor() {
    this.initializeFolders();
  }

  private initializeFolders(): void {
    // Define import folders in priority order: products → superseded → order_status → backorders → dealers
    const folderConfigs = [
      { type: ImportType.PARTS, envKey: "SHAREPOINT_IMPORT_PRODUCTS_FOLDER_ID", priority: 1 },
      { type: ImportType.SUPERSEDED, envKey: "SHAREPOINT_IMPORT_SUPERSEDED_MAPPING_FOLDER_ID", priority: 2 },
      { type: ImportType.ORDER_STATUS, envKey: "SHAREPOINT_IMPORT_ORDER_STATUS_FOLDER_ID", priority: 3 },
      { type: ImportType.BACKORDER, envKey: "SHAREPOINT_IMPORT_BACKORDERS_FOLDER_ID", priority: 4 },
      { type: ImportType.DEALERS, envKey: "SHAREPOINT_IMPORT_DEALERS_FOLDER_ID", priority: 5 },
    ];

    for (const config of folderConfigs) {
      const folderId = process.env[config.envKey];
      if (folderId) {
        this.importFolders.push({
          type: config.type,
          folderId,
          priority: config.priority,
        });
      } else {
        console.warn(`⚠️  Missing ${config.envKey} in environment variables`);
      }
    }

    // Sort by priority
    this.importFolders.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a file has already been processed or if it's been modified since last processing
   */
  private async shouldProcessFile(fileId: string, fileModifiedDate: Date): Promise<boolean> {
    const existingImport = await prisma.importLog.findFirst({
      where: {
        sharePointFileId: fileId,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existingImport) {
      // File never processed
      return true;
    }

    // Check if file was modified after last import
    if (existingImport.sharePointFileModifiedDate) {
      return fileModifiedDate > existingImport.sharePointFileModifiedDate;
    }

    // If no modified date recorded, re-process
    return true;
  }

  /**
   * Process a single file
   */
  private async processFile(
    type: ImportType,
    fileId: string,
    fileName: string,
    fileSize: number,
    fileModifiedDate: Date,
    fileBuffer: ArrayBuffer
  ): Promise<{ success: boolean; importLogId?: number; error?: string }> {
    try {
      console.log(`  📄 Processing: ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`);

      // Upload to Azure for backup
      const fileUrl = await uploadAndSaveImportFile(fileBuffer, fileName, type);

      // Call appropriate import service based on type
      let result;
      const userId = undefined; // System import (no specific user)

      switch (type) {
        case ImportType.PARTS:
          // For products, we need to handle it differently as it's a background job
          // For now, we'll call it directly and wait
          result = await importProducts(fileBuffer, fileName, fileSize, userId, undefined, undefined);
          break;

        case ImportType.DEALERS:
          result = await importDealers(fileBuffer, fileName, fileSize, userId, fileUrl);
          break;

        case ImportType.SUPERSEDED:
          result = await importSuperseded(fileBuffer, fileName, fileSize, userId, fileUrl);
          break;

        case ImportType.BACKORDER:
          result = await importBackOrders(fileBuffer, fileName, fileSize, userId, fileUrl);
          break;

        case ImportType.ORDER_STATUS:
          result = await importOrderStatus(fileBuffer, fileName, fileSize, userId, fileUrl);
          break;

        default:
          throw new Error(`Unknown import type: ${type}`);
      }

      // Update the import log with SharePoint metadata
      if (result.importLogId) {
        await prisma.importLog.update({
          where: { id: result.importLogId },
          data: {
            importSource: ImportSource.SHAREPOINT,
            sharePointFileId: fileId,
            sharePointFileModifiedDate: fileModifiedDate,
            fileUrl: fileUrl || undefined,
          },
        });

        console.log(
          `  ✅ Imported successfully: ${result.successCount}/${result.totalRows} rows (ID: ${result.importLogId})`
        );

        return { success: true, importLogId: result.importLogId };
      }

      return { success: false, error: "Import completed but no import log ID returned" };
    } catch (error: any) {
      console.error(`  ❌ Failed to process ${fileName}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process all files in a folder
   */
  private async processFolderFiles(folderConfig: ImportFolderConfig): Promise<ProcessResult> {
    const result: ProcessResult = {
      type: folderConfig.type,
      foundCount: 0,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      console.log(`\n📁 Processing folder: ${folderConfig.type}`);
      console.log(`   Folder ID: ${folderConfig.folderId}`);

      // List files in folder
      const files = await sharePointService.listFilesInFolder(folderConfig.folderId);

      if (files.length === 0) {
        console.log(`   ℹ️  No files found in folder`);
        return result;
      }

      console.log(`   Found ${files.length} file(s)`);

      // Count only Excel/CSV files
      const validFiles = files.filter(f => f.name.match(/\.(xlsx?|csv)$/i));
      result.foundCount = validFiles.length;

      // Sort files by lastModifiedDateTime (oldest first)
      files.sort((a, b) => {
        return new Date(a.lastModifiedDateTime).getTime() - new Date(b.lastModifiedDateTime).getTime();
      });

      // Process each file
      for (const file of files) {
        // Only process Excel and CSV files
        if (!file.name.match(/\.(xlsx?|csv)$/i)) {
          console.log(`   ⏭️  Skipping non-Excel/CSV file: ${file.name}`);
          result.skippedCount++;
          continue;
        }

        const fileModifiedDate = new Date(file.lastModifiedDateTime);

        // Check if file should be processed
        const shouldProcess = await this.shouldProcessFile(file.id, fileModifiedDate);

        if (!shouldProcess) {
          console.log(`   ⏭️  Already processed (up-to-date): ${file.name}`);
          result.skippedCount++;
          continue;
        }

        // Download file
        try {
          const fileBuffer = await sharePointService.downloadFile(file.id);

          // Process file
          const processResult = await this.processFile(
            folderConfig.type,
            file.id,
            file.name,
            file.size,
            fileModifiedDate,
            fileBuffer
          );

          if (processResult.success) {
            result.processedCount++;
          } else {
            result.failedCount++;
            result.errors.push(`${file.name}: ${processResult.error || "Unknown error"}`);
          }
        } catch (error: any) {
          console.error(`   ❌ Failed to download/process ${file.name}:`, error.message);
          result.failedCount++;
          result.errors.push(`${file.name}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error(`❌ Error processing folder ${folderConfig.type}:`, error.message);
      result.errors.push(`Folder error: ${error.message}`);
    }

    return result;
  }

  /**
   * Run the SharePoint import process
   * Scans all configured folders and processes new/updated files
   */
  async runImport(triggeredBy: SharePointImportTrigger = SharePointImportTrigger.CRON): Promise<SharePointImportResult> {
    const startTime = new Date();
    console.log(`\n🚀 Starting SharePoint Import Process`);
    console.log(`   Triggered by: ${triggeredBy}`);
    console.log(`   Time: ${startTime.toISOString()}`);
    console.log(`   Folders to check: ${this.importFolders.length}`);

    // Create run log entry
    const runLog = await prisma.sharePointImportRun.create({
      data: {
        triggeredBy,
        startedAt: startTime,
      },
    });

    const results: ProcessResult[] = [];
    const globalErrors: string[] = [];

    // Process each folder in priority order
    for (const folderConfig of this.importFolders) {
      try {
        const result = await this.processFolderFiles(folderConfig);
        results.push(result);
      } catch (error: any) {
        console.error(`❌ Critical error processing ${folderConfig.type}:`, error.message);
        globalErrors.push(`${folderConfig.type}: ${error.message}`);
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Calculate totals
    const totalFilesFound = results.reduce((sum, r) => sum + r.foundCount, 0);
    const totalProcessed = results.reduce((sum, r) => sum + r.processedCount, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skippedCount, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failedCount, 0);

    // Determine overall status
    let status = SharePointImportRunStatus.SUCCESS;
    if (totalFailed > 0 && totalProcessed > 0) {
      status = SharePointImportRunStatus.PARTIAL;
    } else if (totalFailed > 0 && totalProcessed === 0) {
      status = SharePointImportRunStatus.FAILED;
    }

    // Build results JSON
    const resultsJson: any = {};
    for (const result of results) {
      resultsJson[result.type] = {
        found: result.foundCount,
        processed: result.processedCount,
        skipped: result.skippedCount,
        failed: result.failedCount,
        errors: result.errors,
      };
    }

    // Update run log
    await prisma.sharePointImportRun.update({
      where: { id: runLog.id },
      data: {
        status,
        completedAt: endTime,
        durationMs,
        totalFilesFound,
        totalFilesProcessed: totalProcessed,
        totalFilesSkipped: totalSkipped,
        totalFilesFailed: totalFailed,
        results: resultsJson,
        errors: globalErrors.length > 0 ? globalErrors : null,
      },
    });

    // Summary
    console.log(`\n📊 Import Process Summary`);
    console.log(`   Run ID: ${runLog.id}`);
    console.log(`   Status: ${status}`);
    console.log(`   Duration: ${(durationMs / 1000).toFixed(2)}s`);
    console.log(`   Found: ${totalFilesFound}`);
    console.log(`   Processed: ${totalProcessed}`);
    console.log(`   Skipped: ${totalSkipped}`);
    console.log(`   Failed: ${totalFailed}`);

    if (totalProcessed > 0) {
      console.log(`\n✅ Successfully processed ${totalProcessed} file(s)`);
    }

    if (totalFailed > 0) {
      console.log(`\n⚠️  ${totalFailed} file(s) failed to process`);
    }

    return {
      success: totalFailed === 0,
      totalProcessed,
      results,
      errors: globalErrors,
      startTime,
      endTime,
      durationMs,
    };
  }
}

// Export singleton instance
export const sharepointImportService = new SharePointImportService();
