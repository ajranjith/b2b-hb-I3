import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import "dotenv/config";

async function getSharePointFolderId() {
  try {
    console.log("🔐 Authenticating with Azure AD...\n");

    // Setup authentication
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );

    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          return token!.token;
        },
      },
    });

    const siteId = process.env.SHAREPOINT_SITE_ID!;

    console.log("📍 Site ID:", siteId);
    console.log("\n🔍 Fetching folders from SharePoint...\n");

    // Get all folders in the root
    const response = await client
      .api(`/sites/${siteId}/drive/root/children`)
      .get();

    console.log("✅ Found folders:\n");
    console.log("=" .repeat(80));

    response.value.forEach((item: any) => {
      if (item.folder) {
        console.log(`📁 Folder: ${item.name}`);
        console.log(`   ID: ${item.id}`);
        console.log(`   Children: ${item.folder.childCount}`);
        console.log("-".repeat(80));
      }
    });

    // Look for specific folders
    const ordersFolder = response.value.find((item: any) =>
      item.name.toLowerCase() === "orders" && item.folder
    );

    const sharedDocsFolder = response.value.find((item: any) =>
      item.name.toLowerCase() === "shared documents" && item.folder
    );

    if (ordersFolder) {
      console.log("\n🎯 Found 'Orders' folder!");
      console.log(`\nAdd this to your .env file:`);
      console.log(`SHAREPOINT_FOLDER_ID=${ordersFolder.id}`);
    } else if (sharedDocsFolder) {
      console.log("\n📂 'Orders' not found in root. Checking 'Shared Documents'...\n");

      // Check inside Shared Documents
      const sharedDocsResponse = await client
        .api(`/sites/${siteId}/drive/items/${sharedDocsFolder.id}/children`)
        .get();

      console.log("Folders in Shared Documents:\n");
      console.log("=".repeat(80));

      sharedDocsResponse.value.forEach((item: any) => {
        if (item.folder) {
          console.log(`📁 Folder: ${item.name}`);
          console.log(`   ID: ${item.id}`);
          console.log(`   Children: ${item.folder.childCount}`);
          console.log("-".repeat(80));
        }
      });

      const ordersInSharedDocs = sharedDocsResponse.value.find((item: any) =>
        item.name.toLowerCase() === "orders" && item.folder
      );

      if (ordersInSharedDocs) {
        console.log("\n🎯 Found 'Orders' folder in Shared Documents!");
        console.log(`\nAdd this to your .env file:`);
        console.log(`SHAREPOINT_FOLDER_ID=${ordersInSharedDocs.id}`);
      } else {
        console.log("\n⚠️ 'Orders' folder not found. Available folders listed above.");
        console.log("Please check the folder name or create it in SharePoint.");
      }
    } else {
      console.log("\n⚠️ No 'Orders' or 'Shared Documents' folder found.");
      console.log("Available folders are listed above.");
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.body) {
      console.error("Details:", JSON.stringify(error.body, null, 2));
    }
  }
}

getSharePointFolderId();
