# SharePoint Automated Import System

## Overview

This system automatically imports Excel/CSV files from SharePoint folders on a scheduled basis. Files from your ERP system are monitored and automatically processed.

## Features

- ✅ **Automated Scheduling**: Runs daily at 2:00 AM (configurable)
- ✅ **Manual Triggering**: Admin API endpoint to run imports on-demand
- ✅ **Smart Processing**: Only processes new or modified files
- ✅ **Priority Order**: Products → Superseded → Order Status → Backorders → Dealers
- ✅ **Oldest First**: Within each folder, processes oldest files first
- ✅ **Re-processing**: Automatically detects and re-imports modified files
- ✅ **Azure Backup**: All imported files are backed up to Azure
- ✅ **Database Tracking**: Tracks all processed files to avoid duplicates
- ✅ **Error Handling**: Comprehensive logging and error tracking

## SharePoint Folder Configuration

The following SharePoint folders are monitored:

| Import Type | SharePoint Folder Name | Folder ID |
|-------------|----------------------|-----------|
| Products | Products Import | `01244NMLNFBBXPG67CBRFK7O7QR3VML6SU` |
| Superseded Mapping | Supersession Mapping Import | `01244NMLJWW5LBRGBDKRBI6GSRQN6OSJVB` |
| Order Status | Order Status Import | `01244NMLJMQQ4HM37NVRBJDRLK5WWMEPFV` |
| Backorders | Backorders Import | `01244NMLJGHQAOHENEFJCZUN6U5MQKPTYH` |
| Dealers | Dealers Import | `01244NMLLESPN2EYAW6BBK54PMH6SJBWHR` |

## Processing Order

Files are processed in this priority order:

1. **Products** - Product catalog with pricing and stock
2. **Superseded Mapping** - Part supersession relationships
3. **Order Status** - Order status updates
4. **Backorders** - Backorder information
5. **Dealers** - Dealer account information

Within each folder, files are processed **oldest first** (by last modified date).

## Schedule Configuration

### Default Schedule
- **Time**: 2:00 AM daily
- **Cron Expression**: `0 2 * * *`

### Changing the Schedule

Edit the `.env` file:

```bash
# Daily at 3:00 AM
SHAREPOINT_IMPORT_SCHEDULE=0 3 * * *

# Every 6 hours
SHAREPOINT_IMPORT_SCHEDULE=0 */6 * * *

# Daily at midnight
SHAREPOINT_IMPORT_SCHEDULE=0 0 * * *
```

### Cron Format
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7, 0 and 7 are Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

## API Endpoints

### 1. Manual Trigger

**Endpoint**: `POST /api/v1/import/sharepoint/trigger`

**Authentication**: Required (Admin only)

**Description**: Manually trigger the import process

**Example**:
```bash
curl -X POST \
  -H "Cookie: token=YOUR_TOKEN" \
  http://localhost:3000/api/v1/import/sharepoint/trigger
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalProcessed": 5,
    "results": [
      {
        "type": "PARTS",
        "processedCount": 2,
        "skippedCount": 0,
        "failedCount": 0,
        "errors": []
      }
    ],
    "errors": [],
    "startTime": "2026-02-19T02:00:00.000Z",
    "endTime": "2026-02-19T02:05:30.000Z",
    "durationMs": 330000
  }
}
```

### 2. Check Status

**Endpoint**: `GET /api/v1/import/sharepoint/status`

**Authentication**: Required (Admin only)

**Description**: Check if an import is currently running

**Example**:
```bash
curl -H "Cookie: token=YOUR_TOKEN" \
  http://localhost:3000/api/v1/import/sharepoint/status
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isRunning": false,
    "message": "No import process is currently running"
  }
}
```

## How It Works

### 1. File Detection
- Scans SharePoint folders at scheduled time
- Lists all Excel (.xlsx, .xls) and CSV files
- Filters out already-processed files
- Identifies new or modified files

### 2. Processing Logic
```
For each file:
  1. Check if file was previously processed
  2. If processed, check if modified since last import
  3. If new or modified:
     - Download from SharePoint
     - Upload to Azure (backup)
     - Process using existing import logic
     - Save metadata in ImportLog
     - Mark as processed
  4. If not modified:
     - Skip file
```

### 3. Tracking System
Each processed file is tracked in the database:
- **sharePointFileId**: Unique SharePoint file ID
- **sharePointFileModifiedDate**: Last modified date
- **importSource**: `SHAREPOINT` (vs `MANUAL`)
- **fileUrl**: Azure backup URL

### 4. Re-processing
Files are re-imported if:
- File was modified after last import
- Last import failed
- File has never been processed

## Database Schema

### ImportLog Table Extensions

```sql
-- New fields added to ImportLog
importSource: 'MANUAL' | 'SHAREPOINT'
sharePointFileId: string (nullable)
sharePointFileModifiedDate: datetime (nullable)
```

### Querying SharePoint Imports

```sql
-- Get all SharePoint imports
SELECT * FROM ImportLog WHERE importSource = 'SHAREPOINT';

-- Get imports by type
SELECT * FROM ImportLog
WHERE importSource = 'SHAREPOINT'
  AND type = 'PARTS'
ORDER BY createdAt DESC;

-- Get processed files
SELECT
  fileName,
  sharePointFileModifiedDate,
  successCount,
  errorCount,
  createdAt
FROM ImportLog
WHERE importSource = 'SHAREPOINT'
  AND sharePointFileId IS NOT NULL;
```

## Monitoring & Logs

### Server Logs
The scheduler outputs detailed logs:

```
🚀 Starting SharePoint Import Process
   Time: 2026-02-19T02:00:00.000Z
   Folders to check: 5

📁 Processing folder: PARTS
   Folder ID: 01244NMLNFBBXPG67CBRFK7O7QR3VML6SU
   Found 3 file(s)

  📄 Processing: products_feb19.xlsx (1.2 MB)
  ✅ Imported successfully: 5000/5000 rows (ID: 123)

📊 Import Process Summary
   Duration: 330.5s
   Processed: 5
   Skipped: 2
   Failed: 0

✅ Successfully processed 5 file(s)
```

### Error Handling
- **SharePoint Unavailable**: Logs error, retries next scheduled run
- **File Download Error**: Logs error, continues with next file
- **Import Validation Error**: Saves errors in ImportErrorsLog
- **Already Running**: Skips run, logs warning

## Troubleshooting

### Import Not Running

1. **Check scheduler status**:
```bash
# Check server logs for:
📅 Scheduling SharePoint imports: 0 2 * * *
✅ SharePoint import scheduler started
```

2. **Verify environment variables**:
```bash
# Required variables in .env:
SHAREPOINT_IMPORT_PRODUCTS_FOLDER_ID=...
SHAREPOINT_IMPORT_SCHEDULE=0 2 * * *
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

3. **Test manual trigger**:
```bash
curl -X POST \
  -H "Cookie: token=YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/v1/import/sharepoint/trigger
```

### Files Not Being Processed

1. **Check file format**: Only `.xlsx`, `.xls`, `.csv` files are processed
2. **Check SharePoint permissions**: Service account must have read access
3. **Check database**: See if file is already processed
```sql
SELECT * FROM ImportLog
WHERE sharePointFileId = 'FILE_ID';
```

### Import Failures

1. **Check ImportErrorsLog**:
```sql
SELECT * FROM ImportErrorsLog
WHERE importLogId IN (
  SELECT id FROM ImportLog
  WHERE importSource = 'SHAREPOINT'
    AND errorCount > 0
);
```

2. **Check file format**: Ensure file matches expected template
3. **Review server logs**: Look for detailed error messages

## Testing

### Test Manual Import

```bash
# 1. Place test file in SharePoint folder
# 2. Trigger manual import
curl -X POST \
  -H "Cookie: token=YOUR_TOKEN" \
  http://localhost:3000/api/v1/import/sharepoint/trigger

# 3. Check results in database
SELECT * FROM ImportLog
WHERE importSource = 'SHAREPOINT'
ORDER BY createdAt DESC
LIMIT 10;
```

### Test Modified File Re-processing

```bash
# 1. Process a file (via manual trigger or wait for scheduled run)
# 2. Modify the file in SharePoint
# 3. Run import again
# 4. Verify file was re-processed (new ImportLog entry)
```

## Maintenance

### Disable Scheduler
To temporarily disable automated imports without stopping the server:

```typescript
// In src/index.ts, comment out:
// scheduledImportsService.start();
```

### Change Schedule
Update `.env`:
```bash
SHAREPOINT_IMPORT_SCHEDULE=0 3 * * *  # Change to 3 AM
```
Then restart the server.

### View Processed Files
```sql
SELECT
  type,
  fileName,
  sharePointFileModifiedDate,
  totalRows,
  successCount,
  errorCount,
  createdAt
FROM ImportLog
WHERE importSource = 'SHAREPOINT'
ORDER BY createdAt DESC;
```

## Security Notes

- ✅ Manual trigger endpoint is **Admin-only**
- ✅ SharePoint credentials stored in `.env` (not in code)
- ✅ Files backed up to Azure with SAS URLs
- ✅ Import logs track who/what triggered the import
- ✅ All imports follow existing validation rules

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Review this documentation
3. Check ImportLog and ImportErrorsLog tables
4. Contact system administrator

---

**Last Updated**: 2026-02-19
