import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";

interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  folderId: string;
}

interface SharePointFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  downloadUrl: string;
}

class SharePointService {
  private client: Client | null = null;
  private config: SharePointConfig;

  constructor() {
    this.config = {
      tenantId: process.env.AZURE_TENANT_ID!,
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      siteId: process.env.SHAREPOINT_SITE_ID!,
      folderId: process.env.SHAREPOINT_FOLDER_ID!,
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    const missing: string[] = [];

    if (!this.config.tenantId) missing.push("AZURE_TENANT_ID");
    if (!this.config.clientId) missing.push("AZURE_CLIENT_ID");
    if (!this.config.clientSecret) missing.push("AZURE_CLIENT_SECRET");
    if (!this.config.siteId) missing.push("SHAREPOINT_SITE_ID");
    if (!this.config.folderId) missing.push("SHAREPOINT_FOLDER_ID");

    if (missing.length > 0) {
      console.warn(
        `⚠️  SharePoint integration disabled. Missing environment variables: ${missing.join(", ")}`
      );
    }
  }

  private isConfigured(): boolean {
    return !!(
      this.config.tenantId &&
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.siteId &&
      this.config.folderId
    );
  }

  private async getClient(): Promise<Client> {
    if (!this.isConfigured()) {
      throw new Error("SharePoint is not configured. Please check environment variables.");
    }

    if (this.client) {
      return this.client;
    }

    const credential = new ClientSecretCredential(
      this.config.tenantId,
      this.config.clientId,
      this.config.clientSecret
    );

    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          return token!.token;
        },
      },
    });

    return this.client;
  }

  /**
   * Upload a file to SharePoint Orders folder
   * @param fileName - Name of the file (e.g., "order_12345_export.xlsx")
   * @param fileBuffer - File content as Buffer
   * @returns SharePoint file URL
   */
  async uploadFile(fileName: string, fileBuffer: Buffer): Promise<string> {
    try {
      if (!this.isConfigured()) {
        console.warn("⚠️  SharePoint upload skipped: not configured");
        return "";
      }

      const client = await this.getClient();

      // Upload file to SharePoint folder
      const response = await client
        .api(`/sites/${this.config.siteId}/drive/items/${this.config.folderId}:/${fileName}:/content`)
        .putStream(fileBuffer);

      const fileUrl = response.webUrl || "";
      console.log(`✅ File uploaded to SharePoint: ${fileName}`);

      return fileUrl;
    } catch (error: any) {
      console.error(`❌ Failed to upload file to SharePoint: ${fileName}`, error.message);
      // Don't throw - we don't want SharePoint upload failures to break order creation
      return "";
    }
  }

  /**
   * Upload order Excel file to SharePoint
   * @param orderNumber - Order number (e.g., "HB2602001")
   * @param fileBuffer - Excel file content as Buffer
   * @returns Promise<boolean> - true if upload succeeded, false otherwise
   */
  async uploadOrderExcel(orderNumber: string, fileBuffer: Buffer): Promise<boolean> {
    const fileName = `${orderNumber}.xlsx`;

    try {
      const fileUrl = await this.uploadFile(fileName, fileBuffer);
      return !!fileUrl; // Returns true if fileUrl is non-empty
    } catch (error: any) {
      console.error(`❌ SharePoint upload failed for order ${orderNumber}:`, error.message);
      return false;
    }
  }

  /**
   * List files in a SharePoint folder
   * @param folderId - SharePoint folder ID
   * @returns Array of file information
   */
  async listFilesInFolder(folderId: string): Promise<SharePointFile[]> {
    try {
      if (!this.isConfigured()) {
        console.warn("⚠️  SharePoint not configured");
        return [];
      }

      const client = await this.getClient();

      // Get all items in the folder (files and folders)
      const response = await client
        .api(`/sites/${this.config.siteId}/drive/items/${folderId}/children`)
        .get();

      // Filter to only include files (not folders) in JavaScript
      const files: SharePointFile[] = response.value
        .filter((item: any) => item.file) // Only items with 'file' property
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          lastModifiedDateTime: item.lastModifiedDateTime,
          webUrl: item.webUrl || "",
          downloadUrl: item["@microsoft.graph.downloadUrl"] || "",
        }));

      return files;
    } catch (error: any) {
      console.error(`❌ Failed to list files in folder ${folderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Download file content from SharePoint
   * @param fileId - SharePoint file ID
   * @returns File content as Buffer
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      if (!this.isConfigured()) {
        throw new Error("SharePoint not configured");
      }

      const client = await this.getClient();

      // Get download URL
      const fileInfo = await client
        .api(`/sites/${this.config.siteId}/drive/items/${fileId}`)
        .get();

      const downloadUrl = fileInfo["@microsoft.graph.downloadUrl"];

      if (!downloadUrl) {
        throw new Error("Could not get download URL for file");
      }

      // Download file content
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error(`❌ Failed to download file ${fileId}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if a file has been modified since a given date
   * @param fileId - SharePoint file ID
   * @param sinceDate - Date to compare against
   * @returns true if file was modified after sinceDate
   */
  async isFileModifiedSince(fileId: string, sinceDate: Date): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      const client = await this.getClient();

      const fileInfo = await client
        .api(`/sites/${this.config.siteId}/drive/items/${fileId}`)
        .select("lastModifiedDateTime")
        .get();

      const lastModified = new Date(fileInfo.lastModifiedDateTime);
      return lastModified > sinceDate;
    } catch (error: any) {
      console.error(`❌ Failed to check file modification date:`, error.message);
      return false;
    }
  }
}

// Export singleton instance
export const sharePointService = new SharePointService();
