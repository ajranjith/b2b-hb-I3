#!/usr/bin/env node

/**
 * Node.js script to test dealer import API
 *
 * Usage:
 *   node test-dealer-import.js <file-path> <auth-token>
 *
 * Example:
 *   node test-dealer-import.js "./dealers.xlsx" "your-auth-token-here"
 */

const fs = require('fs');
const path = require('path');

async function uploadFile(filePath, authToken) {
  console.log('🚀 Starting dealer import...\n');

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('❌ Error: File not found:', filePath);
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const fileSize = fileBuffer.length;

  console.log('📁 File:', fileName);
  console.log('📊 Size:', (fileSize / 1024).toFixed(2), 'KB');
  console.log('🔑 Token:', authToken ? '✓ Provided' : '✗ Missing');
  console.log('\n⏳ Uploading...\n');

  // Create boundary for multipart/form-data
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  // Build multipart body
  const parts = [];

  // Add file part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );

  const header = Buffer.from(parts.join(''), 'utf-8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
  const body = Buffer.concat([header, fileBuffer, footer]);

  try {
    const response = await fetch('http://localhost:3000/api/v1/import/dealers', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': `token=${authToken}`,
      },
      body: body,
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Import Successful!\n');
      console.log('📋 Results:');
      console.log('  • Import Log ID:', data.data.importLogId);
      console.log('  • Total Rows:', data.data.totalRows);
      console.log('  • Success Count:', data.data.successCount);
      console.log('  • Error Count:', data.data.errorCount);
      console.log('  • Duration:', data.data.durationMs + 'ms');

      if (data.data.errorCount > 0) {
        console.log('\n⚠️  Errors:');
        data.data.errors.forEach((error, index) => {
          console.log(`\n  Row ${error.row}:`);
          error.errors.forEach(err => console.log(`    - ${err}`));
        });
      }
    } else {
      console.error('❌ Import Failed!\n');
      console.error('Status:', response.status);
      console.error('Error:', data.errors?.join(', ') || data.message || 'Unknown error');
      console.error('\nFull response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Request Failed!\n');
    console.error('Error:', error.message);
    console.error('\nMake sure:');
    console.error('  1. The server is running (http://localhost:3000)');
    console.error('  2. You are using a valid auth token');
    console.error('  3. The file path is correct');
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node test-dealer-import.js <file-path> <auth-token>');
  console.log('\nExample:');
  console.log('  node test-dealer-import.js "./dealers.xlsx" "abc123xyz"');
  console.log('\nTo get your auth token:');
  console.log('  1. Login to the app in your browser');
  console.log('  2. Open DevTools (F12)');
  console.log('  3. Go to Application > Cookies');
  console.log('  4. Copy the "token" value');
  process.exit(1);
}

const [filePath, authToken] = args;
uploadFile(filePath, authToken);
