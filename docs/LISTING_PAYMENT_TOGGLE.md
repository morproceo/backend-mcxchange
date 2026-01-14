# Listing Payment Toggle Feature

## Overview

This feature allows administrators to control whether sellers must pay a listing fee before submitting listings for review. When disabled, sellers can post listings without payment.

## Admin Configuration

### Enable Payment Requirement (Default)

```bash
PUT /api/admin/settings
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "settings": [
    { "key": "listing_payment_required", "value": "true", "type": "boolean" }
  ]
}
```

### Disable Payment Requirement

```bash
PUT /api/admin/settings
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "settings": [
    { "key": "listing_payment_required", "value": "false", "type": "boolean" }
  ]
}
```

## Frontend Integration

### Check Setting (Public Endpoint)

```bash
GET /api/settings/public
```

**Response:**
```json
{
  "success": true,
  "data": {
    "listingPaymentRequired": true
  }
}
```

### Frontend Logic

```javascript
// On app load or before listing creation
const response = await fetch('/api/settings/public');
const { data } = await response.json();

if (data.listingPaymentRequired) {
  // Show payment step in listing creation flow
} else {
  // Skip payment step, go directly to submit
}
```

## Flow Diagrams

### With Payment Required (Default)

```
Create Listing (DRAFT) → Pay Fee ($35) → Submit for Review → Admin Approves → ACTIVE
```

### Without Payment Required

```
Create Listing (DRAFT) → Submit for Review → Admin Approves → ACTIVE
```

## Database Schema

### Listing Model Addition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `listingFeePaid` | BOOLEAN | false | Tracks whether listing fee has been paid |

### Platform Setting

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `listing_payment_required` | boolean | true | Controls whether payment is required |

## Backend Enforcement

The `submitForReview` method in `listingService.ts` checks:

1. Is `listing_payment_required` setting enabled?
2. Has the listing fee been paid (`listingFeePaid = true`)?

If payment is required but not paid, returns error:
```json
{
  "success": false,
  "error": "Listing fee payment is required before submission."
}
```

## Webhook Integration

When a seller completes payment via Stripe checkout:

1. Stripe sends `checkout.session.completed` webhook
2. Webhook handler checks `metadata.type === 'listing_fee'`
3. Finds the DRAFT listing by `mcNumber` and `sellerId`
4. Updates `listingFeePaid = true`
5. Sends notification to seller

## Files Modified

| File | Changes |
|------|---------|
| `src/models/index.ts` | Added `listingFeePaid` field to Listing model |
| `src/services/adminService.ts` | Added `isListingPaymentRequired()` helper |
| `src/services/listingService.ts` | Enforces payment in `submitForReview` |
| `src/controllers/webhookController.ts` | Marks listing paid on checkout completion |
| `src/routes/index.ts` | Added `/api/settings/public` endpoint |

## Testing

### Test Payment Required (Default)

1. Create a listing (status = DRAFT)
2. Try to submit without payment → Should fail
3. Pay listing fee via checkout
4. Submit for review → Should succeed

### Test Payment Disabled

1. Admin disables payment: `listing_payment_required = false`
2. Create a listing (status = DRAFT)
3. Submit for review → Should succeed without payment

### Test Toggle Behavior

1. Change setting from `true` to `false`
2. New submissions should work without payment
3. Change back to `true`
4. New submissions should require payment again
