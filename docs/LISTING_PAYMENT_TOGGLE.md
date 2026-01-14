# Listing Payment Toggle Feature

## Overview

This feature allows administrators to control whether sellers must pay a listing fee before submitting listings for review. When disabled, sellers can post listings without payment.

## Admin Configuration

### Using the Admin UI (Recommended)

1. Go to **Admin Dashboard** → **Settings**
2. In the **General** tab, find **"Site Features"** section
3. Toggle **"Require Listing Payment"** ON or OFF
4. Changes save automatically

The toggle is highlighted with a border and includes a description explaining its purpose.

### Using the API

#### Enable Payment Requirement (Default)

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

#### Disable Payment Requirement

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

### Public Settings Endpoint

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

### Create Listing Page Behavior

The `CreateListingPage.tsx` component fetches the setting on mount and adjusts the UI:

**When Payment Required (default):**
- Shows 6 steps: Authority Info → Listing Details → Authority Details → Documents → **Payment** → Confirmation
- Step 4 button: "Continue to Payment"
- Redirects to Stripe checkout for $35 fee

**When Payment Disabled:**
- Shows 5 steps: Authority Info → Listing Details → Authority Details → Documents → Confirmation
- Step 4 button: "Submit Listing"
- Creates listing and submits for review directly (no payment)
- Payment step completely hidden from UI and step indicators

### Implementation Details

```javascript
// CreateListingPage.tsx

// Fetch setting on mount
useEffect(() => {
  const fetchPaymentSetting = async () => {
    const response = await api.getPublicSettings()
    setListingPaymentRequired(response.data.listingPaymentRequired)
  }
  fetchPaymentSetting()
}, [])

// Filter steps based on setting
const stepInfo = listingPaymentRequired
  ? allSteps
  : allSteps.filter(s => !s.isPaymentStep)
```

## Flow Diagrams

### With Payment Required (Default) - 6 Steps

```
Step 1: Authority Info
    ↓
Step 2: Listing Details
    ↓
Step 3: Authority Details
    ↓
Step 4: Documents
    ↓
Step 5: Payment ($35 via Stripe)
    ↓
Step 6: Confirmation
    ↓
Listing Status: PENDING_REVIEW → Admin Approves → ACTIVE
```

### Without Payment Required - 5 Steps

```
Step 1: Authority Info
    ↓
Step 2: Listing Details
    ↓
Step 3: Authority Details
    ↓
Step 4: Documents → [Submit Listing]
    ↓
Step 5: Confirmation
    ↓
Listing Status: PENDING_REVIEW → Admin Approves → ACTIVE
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

### Backend (`/backend/src/`)

| File | Changes |
|------|---------|
| `models/index.ts` | Added `listingFeePaid` field to Listing model |
| `services/adminService.ts` | Added `isListingPaymentRequired()` helper |
| `services/listingService.ts` | Enforces payment in `submitForReview` |
| `controllers/webhookController.ts` | Marks listing paid on checkout completion |
| `routes/index.ts` | Added `/api/settings/public` endpoint |

### Frontend (`/frontend/src/`)

| File | Changes |
|------|---------|
| `services/api.ts` | Added `getPublicSettings()`, `getPlatformSettings()`, `updatePlatformSettings()` |
| `pages/AdminSettingsPage.tsx` | Added "Require Listing Payment" toggle in Site Features |
| `pages/CreateListingPage.tsx` | Conditionally hides payment step based on setting |

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
