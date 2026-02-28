# Validation Error Format

## Overview

All validation errors across the API now follow a consistent format, making it easier for frontend developers to handle and display validation errors.

---

## Error Format

### Validation Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "fieldName": ["Error message 1", "Error message 2"],
    "anotherField": ["Error message"]
  }
}
```

**Status Code:** `400 Bad Request`

---

## Example Responses

### Single Field Error

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"password123"}'
```

**Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["Invalid email address"]
  }
}
```

---

### Multiple Field Errors

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["Required"],
    "password": ["Required"]
  }
}
```

---

### Type Mismatch Error

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/user/dealer \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{
    "accountNumber": "12345",
    ...
  }'
```

**Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "accountNumber": ["Expected number, received string"]
  }
}
```

---

## Implementation

### Validation Hook

All endpoints use a custom `validationHook` that intercepts Zod validation errors and formats them consistently.

**File:** `src/middleware/validationHook.ts`

```typescript
export const validationHook = (
  result: { success: boolean; data?: any; error?: z.ZodError },
  c: Context
) => {
  if (!result.success && result.error) {
    const errors: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(issue.message);
    }

    return c.json(
      {
        success: false,
        message: 'Validation failed',
        errors,
      },
      400
    );
  }
};
```

---

### Usage in Routes

Import the validation hook and pass it as the third parameter to `zValidator`:

```typescript
import { validationHook } from '@/middleware/validationHook';

// Example usage
userRoutes.post(
  '/dealer',
  authenticate,
  zValidator('json', createDealerSchema, validationHook),
  async (c) => {
    // Handler code
  }
);
```

---

## Updated Endpoints

The following endpoints now use the consistent validation error format:

### Auth Module
- **POST /api/v1/auth/login/admin** - Admin login
- **POST /api/v1/auth/login/dealer** - Dealer login

### User Module
- **POST /api/v1/user/admin** - Create admin
- **POST /api/v1/user/dealer** - Create dealer
- **GET /api/v1/user/dealer** - List dealers (query validation)

### Products Module
- **GET /api/v1/products** - List products (query validation)

---

## Frontend Integration

### TypeScript Interface

```typescript
interface ValidationErrorResponse {
  success: false;
  message: string;
  errors: Record<string, string[]>;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type ApiResponse<T> = SuccessResponse<T> | ValidationErrorResponse;
```

### Example Usage (React)

```typescript
async function createDealer(data: DealerData) {
  const response = await fetch('/api/v1/user/dealer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!result.success) {
    // Handle validation errors
    const errors = result.errors;

    // Display errors per field
    Object.entries(errors).forEach(([field, messages]) => {
      console.error(`${field}: ${messages.join(', ')}`);
    });

    return;
  }

  // Success case
  console.log('Dealer created:', result.data);
}
```

### Example Usage (Vue/Nuxt)

```typescript
const errors = ref<Record<string, string[]>>({});

async function submitForm() {
  try {
    const response = await $fetch('/api/v1/user/dealer', {
      method: 'POST',
      body: formData,
    });

    if (!response.success) {
      errors.value = response.errors;
      return;
    }

    // Success
    navigateTo('/dealers');
  } catch (error) {
    console.error('API error:', error);
  }
}
```

---

## Benefits

1. **Consistency** - All validation errors follow the same format
2. **Field-Level Errors** - Errors are grouped by field name
3. **Multiple Errors** - Each field can have multiple validation errors
4. **Easy to Display** - Frontend can easily map errors to form fields
5. **Type-Safe** - Clear TypeScript interfaces for error handling

---

## Testing

Test validation errors with curl:

```bash
# Test single error
curl -X POST http://localhost:3000/api/v1/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid","password":"pass123"}'

# Test multiple errors
curl -X POST http://localhost:3000/api/v1/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{}'

# Test type mismatch
curl -X POST http://localhost:3000/api/v1/user/dealer \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{"accountNumber":"string-not-number"}'
```

---

## Notes

- Validation errors always return status code `400`
- The `success` field is always `false` for validation errors
- The `message` field always contains `"Validation failed"`
- The `errors` object contains field-level error messages
- Nested field errors use dot notation (e.g., `"user.address.street"`)
