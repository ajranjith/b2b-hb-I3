# Testing File Upload APIs

## The Problem with Scalar Docs

**Scalar's "Try it" interface does NOT work properly with file uploads.** When you select a file in Scalar, it sends the literal string `"@filename"` instead of the actual file binary data. This is a known limitation of browser-based API documentation tools.

## ✅ Working Methods to Test File Uploads

### Method 1: HTML Test Form (Easiest)

1. Open `test-upload.html` in your browser
2. Select your Excel file
3. Click "Upload and Import"
4. View results

**Prerequisites:**
- You must be logged in (have a valid auth token cookie)
- Server must be running on `http://localhost:3000`

### Method 2: Node.js Script

```bash
node test-dealer-import.js "./path/to/dealers.xlsx" "your-auth-token"
```

**To get your auth token:**
1. Login to the app in browser
2. Open DevTools (F12)
3. Go to Application → Cookies
4. Copy the `token` value

### Method 3: curl Command

```bash
curl -X POST \
  -H "Cookie: token=YOUR_TOKEN" \
  -F "file=@/full/path/to/dealers.xlsx" \
  http://localhost:3000/api/v1/import/dealers
```

**Tips:**
- Use absolute paths for the file
- Escape spaces in paths: `Dealer\ Accounts.xlsx`
- Use `-v` flag for verbose output

### Method 4: Postman

1. Create new request: `POST http://localhost:3000/api/v1/import/dealers`
2. Go to **Headers** tab:
   - Add `Cookie: token=YOUR_TOKEN`
3. Go to **Body** tab:
   - Select **form-data** (not binary!)
   - Add key: `file`
   - Change type from "Text" to **"File"**
   - Click "Select Files" and choose your Excel file
4. Click Send

### Method 5: Insomnia

1. Create new request: `POST http://localhost:3000/api/v1/import/dealers`
2. Auth → Cookie → Add: `token=YOUR_TOKEN`
3. Body → Multipart Form
4. Add field:
   - Name: `file`
   - Type: **File** (not Text!)
   - Click "Choose File"
5. Send

## Expected Response

### Success (200 OK)

```json
{
  "success": true,
  "data": {
    "importLogId": 1,
    "totalRows": 30,
    "successCount": 30,
    "errorCount": 0,
    "durationMs": 1234,
    "errors": []
  }
}
```

### With Errors (200 OK)

```json
{
  "success": true,
  "data": {
    "importLogId": 2,
    "totalRows": 30,
    "successCount": 28,
    "errorCount": 2,
    "durationMs": 1456,
    "errors": [
      {
        "row": 5,
        "data": { "email": "invalid-email", ... },
        "errors": ["Invalid email format"]
      },
      {
        "row": 12,
        "data": { "accountNumber": -1, ... },
        "errors": ["Account Number must be a positive number"]
      }
    ]
  }
}
```

### Authentication Error (401)

```json
{
  "success": false,
  "errors": ["Authentication required"],
  "code": "UNAUTHORIZED_ERROR"
}
```

### Validation Error (400)

```json
{
  "success": false,
  "errors": ["Invalid file extension. Allowed extensions: .xlsx, .xls, .csv"],
  "code": "HTTP_ERROR"
}
```

## Why This Happens

### Root Cause

Browser-based API documentation tools (like Scalar, Swagger UI, etc.) have limitations with binary file uploads because:

1. **Security restrictions**: Browsers restrict how JavaScript can access and send files
2. **Request serialization**: These tools try to serialize everything as JSON/text
3. **curl syntax confusion**: The `@filename` syntax is curl-specific, not a universal standard

### Proper Implementation

Our API **IS correctly implemented** using industry best practices:

- ✅ Uses `multipart/form-data` content type
- ✅ Proper OpenAPI 3.0 specification with `format: binary`
- ✅ Validates file size, type, and extension
- ✅ Returns detailed error messages
- ✅ Works perfectly with curl, Postman, and programmatic clients

### Not a Bug, It's a Tool Limitation

This is **not an API bug**. The API works correctly when called with proper HTTP requests. The issue is that Scalar's "Try it" feature cannot construct proper multipart/form-data requests for file uploads.

## Best Practices for File Upload APIs

1. **Always use `multipart/form-data`** for file uploads
2. **Validate on the server side**: file size, type, extension
3. **Use proper OpenAPI documentation**: `type: string, format: binary`
4. **Provide multiple testing methods**: HTML form, CLI script, curl examples
5. **Document the limitation** of browser-based API docs
6. **Return structured errors** with clear messages
7. **Log imports** for audit trail (we do this with ImportLog table)

## Troubleshooting

### "No file provided"
- Make sure field name is exactly `file`
- Ensure you selected "File" type (not "Text") in Postman/Insomnia
- Check you're using `-F` flag in curl (not `-d`)

### "Authentication required"
- Make sure you're logged in
- Check your auth token is valid (not expired)
- Ensure Cookie header is properly set

### "Invalid file type"
- Only .xlsx, .xls, .csv files are allowed
- Check file extension (case-insensitive)
- Ensure file is not corrupted

### "File size exceeds limit"
- Maximum file size is 50MB
- Compress or split large files

## Production Considerations

When deploying to production:

1. **Rate limiting**: Add rate limits to prevent abuse
2. **File scanning**: Scan for malware/viruses
3. **Storage**: Consider where uploaded files are temporarily stored
4. **Cleanup**: Implement cleanup for temporary files
5. **Monitoring**: Monitor import success/failure rates
6. **Notifications**: Alert admins on large imports or failures
7. **Documentation**: Keep Scalar docs for reference, use Postman collections for actual testing
