# Quick Test Guide - Dealer Import API

## 🚫 DON'T Use Scalar "Try it" for File Uploads
It sends `"@filename"` as a string instead of actual file data. This is a browser limitation, not an API bug.

## ✅ DO Use One of These Methods

### 1. HTML Form (Easiest - No Setup Required)

```bash
# Open in browser
open test-upload.html
```

Make sure you're logged in first!

---

### 2. Node.js Script (Quick CLI Testing)

```bash
node test-dealer-import.js "./dealers.xlsx" "YOUR_TOKEN"
```

**Get token:** Browser DevTools → Application → Cookies → copy `token` value

---

### 3. curl (For Terminal Users)

```bash
curl -X POST \
  -H "Cookie: token=YOUR_TOKEN" \
  -F "file=@/Users/ajith/Desktop/B2b_Sample\ Data/Dealer_Accounts_Sample_30_NetTiers.xlsx" \
  http://localhost:3000/api/v1/import/dealers
```

---

### 4. Postman (For Regular API Testing)

1. POST `http://localhost:3000/api/v1/import/dealers`
2. Headers: `Cookie: token=YOUR_TOKEN`
3. Body: **form-data** → Key: `file` → Type: **File** → Select file
4. Send

---

## That's It!

All these methods work perfectly. The API is correctly implemented. Scalar docs are great for **viewing** documentation, but use the methods above for **testing** file uploads.

For more details, see `TESTING_FILE_UPLOADS.md`
