# Email Retry Logic Update

## Summary

Updated the email service to retry on the **same SMTP host** for transient failures instead of trying different SMTP servers.

## What Changed

### Before (Multiple SMTP Hosts)

```typescript
// ❌ Tried multiple different SMTP servers
const smtpHosts = [
  "smtp.office365.com",
  "smtp-mail.outlook.com",
  // ... more hosts
];

// Would try each host if previous failed
for (const host of smtpHosts) {
  try {
    // Send via this host
  } catch {
    continue; // Try next host
  }
}
```

**Problems:**
- Masked configuration errors
- Wasted time trying wrong hosts
- Authentication failures would retry unnecessarily
- Added complexity

### After (Smart Retry on Same Host)

```typescript
// ✅ Retry on configured SMTP host only
const smtpHost = this.config.host; // From .env
const maxRetries = 3;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    // Send via configured host
  } catch (error) {
    if (isRetryable(error) && attempt < maxRetries) {
      await sleep(1000); // Wait before retry
      continue; // Retry same host
    } else {
      break; // Stop on non-retryable errors
    }
  }
}
```

**Benefits:**
- Only retries on transient failures
- Fails fast on configuration errors
- Clearer error messages
- Simpler logic

## Retry Logic Details

### Retry Configuration

```typescript
{
  maxRetries: 3,      // Total attempts (1 initial + 2 retries)
  retryDelay: 1000    // 1 second delay between retries
}
```

### Retryable Errors (Transient)

**Network/Connection Errors:**
- `ETIMEDOUT` - Connection timeout
- `ECONNREFUSED` - Connection refused
- `ECONNRESET` - Connection reset
- `ENOTFOUND` - DNS lookup failed
- `ENETUNREACH` - Network unreachable
- `EAI_AGAIN` - DNS temporary failure

**SMTP Temporary Errors:**
- `421` - Service not available (temporary)
- `450` - Mailbox unavailable (temporary)
- `451` - Local error in processing
- `452` - Insufficient system storage

### Non-Retryable Errors (Permanent)

**Authentication Errors:**
- `EAUTH` - Authentication failed
- `535` - Invalid credentials

**Configuration Errors:**
- Invalid SMTP host
- Wrong port
- Missing credentials

These fail immediately without retry since retrying won't help.

## Example Behavior

### Scenario 1: Temporary Network Issue

```
Attempt 1: Connection timeout (ETIMEDOUT)
  → Retry after 1s

Attempt 2: Connection timeout (ETIMEDOUT)
  → Retry after 1s

Attempt 3: Success! Email sent
  → ✅ Result: Success
```

### Scenario 2: Authentication Failure

```
Attempt 1: Authentication failed (EAUTH)
  → Non-retryable error
  → ❌ Result: Failed (no retry)

Total time: < 1 second (fast failure)
```

### Scenario 3: All Retries Failed

```
Attempt 1: Network unreachable (ENETUNREACH)
  → Retry after 1s

Attempt 2: Network unreachable (ENETUNREACH)
  → Retry after 1s

Attempt 3: Network unreachable (ENETUNREACH)
  → ❌ Result: Failed after 3 attempts
```

## Configuration

The retry behavior is controlled in `emailService.ts`:

```typescript
private getRetryConfig() {
  return {
    maxRetries: 3,      // Change to adjust retry attempts
    retryDelay: 1000,   // Change to adjust delay (ms)
  };
}
```

**Recommended values:**
- `maxRetries: 3` - Good balance between reliability and speed
- `retryDelay: 1000` - 1 second is usually enough for transient issues

**For production environments with high reliability needs:**
- `maxRetries: 5`
- `retryDelay: 2000`

**For development/testing (fail fast):**
- `maxRetries: 1` (no retry)
- `retryDelay: 0`

## Benefits

### ✅ Faster Failures

**Before:**
```
Auth error → Try host 1 (fail) → Try host 2 (fail) → Try host 3 (fail)
Total: ~30 seconds with timeouts
```

**After:**
```
Auth error → Fail immediately (non-retryable)
Total: < 1 second
```

### ✅ Clearer Errors

**Before:**
```
"Failed on smtp.office365.com, smtp-mail.outlook.com: EAUTH"
^ Which host should I configure?
```

**After:**
```
"Failed on smtp.office365.com: EAUTH - Invalid credentials"
^ Clear: fix your SMTP_HOST config
```

### ✅ Smarter Retries

**Before:**
- Retried on every error (even auth failures)
- Wasted time trying wrong hosts

**After:**
- Only retries transient errors
- Uses configured host only

## Code Changes

### File Modified

`src/services/emailService.ts`

### Methods Changed

1. **Removed:** `getSMTPHosts()` - No longer tries multiple hosts
2. **Added:** `getRetryConfig()` - Retry configuration
3. **Added:** `sleep()` - Delay helper
4. **Added:** `isRetryableError()` - Smart error detection
5. **Updated:** `sendEmail()` - New retry logic

### Lines of Code

- **Before:** ~80 lines (sendEmail + getSMTPHosts)
- **After:** ~120 lines (sendEmail + helpers + error detection)
- **Added logic:** Smart error classification

## Testing

### Test Transient Failures

Temporarily set invalid SMTP host to test retry:

```typescript
// In .env temporarily
SMTP_HOST=invalid-host.example.com

// Should retry 3 times then fail
```

### Test Authentication Failures

Use wrong password:

```typescript
// In .env temporarily
SMTP_PASSWORD=example-app-password

// Should fail immediately without retry
```

### Test Success

Use correct configuration:

```typescript
// In .env
SMTP_HOST=smtp.office365.com
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=example-app-password

// Should succeed on first attempt
```

## Monitoring

Watch the logs to see retry behavior:

```
Attempting to send email via smtp.office365.com...
SMTP server smtp.office365.com connection verified
Email sent successfully via smtp.office365.com. Message ID: <id>
```

Or with retries:

```
Attempting to send email via smtp.office365.com...
Attempt 1/3 failed with retryable error: Connection timeout
Retry attempt 2/3 after 1000ms delay...
Email sent successfully via smtp.office365.com. Message ID: <id>
```

## Database Logging

Email logs now track retry attempts in metadata:

```sql
SELECT
  "emailStatus",
  metadata->>'smtpHost' as smtp_host,
  metadata->>'errorDetails' as error_details
FROM "EmailLog"
WHERE "emailStatus" = 'FAILED'
ORDER BY "createdAt" DESC;
```

## Summary

✅ **Simplified:** Only uses configured SMTP host
✅ **Smarter:** Only retries transient failures
✅ **Faster:** Fails fast on configuration errors
✅ **Clearer:** Better error messages
✅ **Configurable:** Easy to adjust retry behavior

**Result:** More reliable email delivery with better error handling!

