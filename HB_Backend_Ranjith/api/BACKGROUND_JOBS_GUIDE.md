# Background Jobs for Product Import

## Overview

Product imports now run as **background jobs** to handle large files (700k+ rows) without timeouts.

**Key Features:**
- ✅ No Redis or external queue needed
- ✅ API returns immediately (202 Accepted)
- ✅ Process runs in background
- ✅ Real-time progress tracking
- ✅ Handles 700k+ rows efficiently
- ✅ Chunked processing (10,000 rows per batch)
- ✅ Auto-syncs to TypeSense after successful import
- ✅ Only for products (dealers remain synchronous)

---

## How It Works

### 1. Start Import (POST /import/products)

**Request:**
```bash
curl -X POST \
  -H "Cookie: token=YOUR_TOKEN" \
  -F "file=@products.xlsx" \
  http://localhost:3000/api/v1/import/products
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Product import started in background",
  "data": {
    "jobId": 123,
    "statusUrl": "/api/v1/import/status/123"
  }
}
```

**What Happens:**
1. File is validated
2. ImportLog record created
3. Job registered in job manager
4. Background process started
5. API returns immediately with job ID

---

### 2. Check Progress (GET /import/status/:jobId)

**Request:**
```bash
curl -H "Cookie: token=YOUR_TOKEN" \
  http://localhost:3000/api/v1/import/status/123
```

**Response (Processing):**
```json
{
  "success": true,
  "data": {
    "jobId": 123,
    "status": "processing",
    "progress": {
      "current": 50000,
      "total": 700000,
      "percentage": 7
    },
    "startedAt": "2024-01-28T10:00:00Z"
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "data": {
    "jobId": 123,
    "status": "completed",
    "progress": {
      "current": 700000,
      "total": 700000,
      "percentage": 100
    },
    "startedAt": "2024-01-28T10:00:00Z",
    "completedAt": "2024-01-28T10:25:30Z",
    "results": {
      "totalRows": 700000,
      "successCount": 699500,
      "errorCount": 500
    }
  }
}
```

**Response (Failed):**
```json
{
  "success": true,
  "data": {
    "jobId": 123,
    "status": "failed",
    "progress": {
      "current": 10000,
      "total": 700000,
      "percentage": 1
    },
    "startedAt": "2024-01-28T10:00:00Z",
    "completedAt": "2024-01-28T10:05:00Z",
    "error": "Database connection failed"
  }
}
```

---

## Job Statuses

| Status | Description |
|--------|-------------|
| `pending` | Job created, not yet started |
| `processing` | Import is running |
| `completed` | Import finished successfully |
| `failed` | Import encountered an error |

---

## Architecture

### Components

**1. Job Manager (`src/lib/jobManager.ts`)**
- In-memory job tracking
- Stores: status, progress, timestamps
- Auto-cleanup after 1 hour

**2. Import Service (`src/modules/import/_services.products.ts`)**
- Validates Excel structure
- Processes in chunks (10,000 rows/batch)
- Each batch processed in a single transaction with bulk operations
- Bulk creates new products, bulk updates existing products
- Bulk archives old stock/price records, bulk creates new records
- Falls back to individual processing if batch fails
- Reports progress via callback
- Updates ImportLog in database

**3. API Endpoints (`src/modules/import/index.ts`)**
- POST `/import/products` - Start import
- GET `/import/status/:jobId` - Check progress

**4. Database (`ImportLog` table)**
- Persists import metadata with `importStatus` field (PENDING, PROCESSING, COMPLETED, FAILED)
- Stores final results
- Survives server restarts
- Status is updated throughout the import lifecycle

### Data Flow

```
User uploads file
     ↓
Validate file
     ↓
Create ImportLog record (importStatus: PENDING)
     ↓
Register job in JobManager
     ↓
Start background process (async)
     ↓
Return 202 with job ID ← User gets response immediately
     ↓
Background: Parse Excel
     ↓
Background: Update ImportLog (importStatus: PROCESSING)
     ↓
Background: Process in chunks (10,000 rows)
     ↓
Background: Update progress after each chunk
     ↓
Background: Update ImportLog (importStatus: COMPLETED or FAILED)
     ↓
Background: Auto-sync to TypeSense (if successful)
     ↓
User polls /status/:jobId for updates
```

---

## Performance Characteristics

### For 700,000 Rows:

**Parsing:**
- ~2-5 seconds to parse Excel
- Streams data, minimal memory

**Processing:**
- 70 chunks × ~2-5 seconds/chunk
- **Total: ~5-15 minutes** (depends on database speed)
- Significant performance improvement with bulk operations

**Memory:**
- Processes 10,000 rows at a time
- Constant memory usage (~50MB)

**Database:**
- Single transaction per batch (10,000 rows)
- Bulk operations within each transaction:
  - createMany for new products
  - updateMany for archiving old records
  - createMany for new stock/price records
- Updates ImportLog every batch
- **Performance: ~6,000x fewer database operations** compared to individual transactions
  - Before: 4.2M operations (700k × 6 ops each)
  - After: 700 operations (70 batches × 10 ops each)

---

## Error Handling

### File-Level Errors
- Invalid file format
- Missing required headers
- File size exceeded
→ **Returns 400 immediately (before job starts)**

### Row-Level Errors
- Invalid data in specific rows
- Duplicate product codes
- Validation failures
→ **Continues processing, collects errors**
→ **Returns error rows in final results**

### System Errors
- Database connection lost
- Out of memory
- Unexpected exceptions
→ **Marks job as 'failed'**
→ **Stores error message**

---

## Polling Best Practices

### Client-Side Implementation

```javascript
async function uploadAndMonitor(file) {
  // 1. Start import
  const uploadRes = await fetch('/api/v1/import/products', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  const { data } = await uploadRes.json();
  const { jobId } = data;

  // 2. Poll for status
  const interval = setInterval(async () => {
    const statusRes = await fetch(`/api/v1/import/status/${jobId}`, {
      credentials: 'include'
    });

    const { data: status } = await statusRes.json();

    // Update UI with progress
    console.log(`Progress: ${status.progress.percentage}%`);

    // Check if done
    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
      console.log('Import finished:', status);
    }
  }, 2000); // Poll every 2 seconds
}
```

**Recommendations:**
- Poll every 2-5 seconds
- Show progress bar to user
- Handle network errors gracefully
- Stop polling when status is 'completed' or 'failed'

---

## Comparison: Dealers vs Products

| Feature | Dealers Import | Products Import |
|---------|---------------|-----------------|
| **Processing** | Synchronous | Background Job |
| **Response** | 200 with results | 202 with job ID |
| **Typical Size** | ~30-1000 rows | 10k-700k+ rows |
| **Duration** | Seconds | Minutes to hours |
| **Progress** | No | Yes |
| **Timeout Risk** | Low | None |

---

## Limitations & Considerations

### Current Limitations:
1. **Single Server Only**: Jobs stored in memory, not shared across servers
2. **Server Restart**: Running jobs will be lost (but ImportLog persists)
3. **No Retry**: Failed jobs must be re-uploaded
4. **No Priority**: Jobs processed in order started

### When to Upgrade:
If you need:
- **Multiple servers** → Use Redis + Bull queue
- **Job persistence** → Use database queue
- **Retry logic** → Use job queue with retry
- **Scheduled imports** → Use cron + job queue

---

## Monitoring & Debugging

### Check Active Jobs
```typescript
// In your code
import { jobManager } from '@/lib/jobManager';

const activeJobs = jobManager.getAllJobs();
console.log('Active jobs:', activeJobs);
```

### Database Queries
```sql
-- Recent imports
SELECT * FROM "ImportLog"
WHERE type = 'PARTS'
ORDER BY "createdAt" DESC
LIMIT 10;

-- In-progress imports
SELECT * FROM "ImportLog"
WHERE type = 'PARTS'
AND "completedAt" IS NULL;

-- Failed imports
SELECT * FROM "ImportLog"
WHERE type = 'PARTS'
AND "errorCount" > 0;
```

### Logs
- Progress updates logged to console
- Errors captured in ImportErrorsLog table
- Job failures stored in job manager

---

## Production Checklist

Before deploying to production:

- [ ] Test with large file (100k+ rows)
- [ ] Test with invalid data
- [ ] Test with network interruption
- [ ] Monitor memory usage during import
- [ ] Set up alerts for failed jobs
- [ ] Document polling intervals for frontend
- [ ] Test concurrent imports (multiple users)
- [ ] Verify job cleanup (after 1 hour)
- [ ] Test ImportLog persistence
- [ ] Load test database with bulk inserts

---

## Future Enhancements

Potential improvements:
1. **Pause/Resume**: Allow pausing long-running imports
2. **Priority Queue**: Process urgent imports first
3. **Webhooks**: Notify external systems on completion
4. **Scheduled Imports**: Auto-import from FTP/S3
5. **Partial Results**: Download successfully imported rows
6. **Rollback**: Undo an import
7. **Duplicate Detection**: Skip already imported products
8. **Delta Imports**: Only import changed rows

---

## Support

For issues or questions:
- Check ImportLog table for job history
- Check ImportErrorsLog for error details
- Use GET /import/status/:jobId for real-time status
- Monitor server logs for exceptions
