#!/usr/bin/env bun
/**
 * Script to discover SharePoint folder IDs for import automation
 *
 * This script connects to SharePoint and lists all folders to help identify
 * the folder IDs for: products, superseded_mapping, order_status, backorders, dealers
 */

import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env") });

interface FolderInfo {
  name: string;
  id: string;
  webUrl: string;
  parentPath: string;
}

const TARGET_FOLDERS = [
  'products',
  'superseded_mapping',
  'order_status',
  'backorders',
  'dealers'
];

async function getSharePointClient(): Promise<Client> {
  const tenantId = process.env.AZURE_TENANT_ID!;
  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Azure AD credentials in .env file');
  }

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
  );

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        return token!.token;
      },
    },
  });

  return client;
}

async function listAllFolders(client: Client, siteId: string, driveId?: string): Promise<FolderInfo[]> {
  const folders: FolderInfo[] = [];

  try {
    // If no driveId provided, get the default drive
    let drive;
    if (!driveId) {
      console.log('🔍 Getting default drive...');
      drive = await client.api(`/sites/${siteId}/drive`).get();
      driveId = drive.id;
      console.log(`✅ Found drive: ${drive.name} (${driveId})`);
    }

    // Get root folder items
    console.log('\n🔍 Listing folders in root...');
    const rootItems = await client
      .api(`/sites/${siteId}/drive/root/children`)
      .get();

    // Process folders
    for (const item of rootItems.value) {
      if (item.folder) {
        const folderInfo: FolderInfo = {
          name: item.name,
          id: item.id,
          webUrl: item.webUrl || '',
          parentPath: '/'
        };
        folders.push(folderInfo);

        // Check if this is a target folder
        if (TARGET_FOLDERS.includes(item.name.toLowerCase())) {
          console.log(`\n✅ FOUND TARGET FOLDER: ${item.name}`);
          console.log(`   ID: ${item.id}`);
          console.log(`   URL: ${item.webUrl || 'N/A'}`);
        }
      }
    }

    // Also check subfolders (one level deep)
    console.log('\n🔍 Checking subfolders...');
    for (const folder of [...folders]) {
      try {
        const subItems = await client
          .api(`/sites/${siteId}/drive/items/${folder.id}/children`)
          .get();

        for (const subItem of subItems.value) {
          if (subItem.folder) {
            const subFolderInfo: FolderInfo = {
              name: subItem.name,
              id: subItem.id,
              webUrl: subItem.webUrl || '',
              parentPath: `/${folder.name}`
            };
            folders.push(subFolderInfo);

            // Check if this is a target folder
            if (TARGET_FOLDERS.includes(subItem.name.toLowerCase())) {
              console.log(`\n✅ FOUND TARGET FOLDER: ${subItem.name}`);
              console.log(`   Parent: ${folder.name}`);
              console.log(`   ID: ${subItem.id}`);
              console.log(`   URL: ${subItem.webUrl || 'N/A'}`);
            }
          }
        }
      } catch (error: any) {
        console.log(`   ⚠️  Could not access subfolder: ${folder.name}`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error listing folders:', error.message);
    throw error;
  }

  return folders;
}

async function main() {
  console.log('🚀 SharePoint Folder Discovery Script');
  console.log('=====================================\n');

  const siteId = process.env.SHAREPOINT_SITE_ID;

  if (!siteId) {
    throw new Error('Missing SHAREPOINT_SITE_ID in .env file');
  }

  console.log(`📍 Site ID: ${siteId}\n`);
  console.log(`🎯 Looking for folders: ${TARGET_FOLDERS.join(', ')}\n`);

  const client = await getSharePointClient();
  console.log('✅ Connected to SharePoint\n');

  const folders = await listAllFolders(client, siteId);

  console.log('\n\n📊 SUMMARY');
  console.log('==========\n');
  console.log(`Total folders found: ${folders.length}\n`);

  // Find target folders
  const foundTargets: { [key: string]: FolderInfo | undefined } = {};
  TARGET_FOLDERS.forEach(targetName => {
    const found = folders.find(f => f.name.toLowerCase() === targetName.toLowerCase());
    foundTargets[targetName] = found;
  });

  console.log('🎯 Target Folders Status:\n');
  TARGET_FOLDERS.forEach(targetName => {
    const found = foundTargets[targetName];
    if (found) {
      console.log(`✅ ${targetName.toUpperCase()}`);
      console.log(`   Folder ID: ${found.id}`);
      console.log(`   Path: ${found.parentPath}/${found.name}`);
    } else {
      console.log(`❌ ${targetName.toUpperCase()} - NOT FOUND`);
    }
    console.log('');
  });

  // Generate .env format
  console.log('\n📝 ENV VARIABLES (copy to .env):');
  console.log('==================================\n');
  TARGET_FOLDERS.forEach(targetName => {
    const found = foundTargets[targetName];
    const envKey = `SHAREPOINT_IMPORT_${targetName.toUpperCase()}_FOLDER_ID`;
    const envValue = found ? found.id : 'NOT_FOUND';
    console.log(`${envKey}=${envValue}`);
  });

  console.log('\n\n📋 ALL FOLDERS (for reference):');
  console.log('================================\n');
  folders.forEach(folder => {
    console.log(`${folder.parentPath}/${folder.name}`);
    console.log(`  ID: ${folder.id}\n`);
  });
}

main()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
