# Rate Limiting Configuration

## Overview

The API uses rate limiting to protect against abuse, brute force attacks, and excessive usage. Rate limits are enforced per IP address (or per user ID when authenticated).

## Rate Limits by Endpoint

| Limiter | Endpoints | Production Limit | Window | Purpose |
|---------|-----------|------------------|--------|---------|
| **Global** | All routes | 300 requests | 15 min | General protection |
| **Auth** | `/api/auth/*` | 20 requests | 15 min | Prevent brute force |
| **Password Reset** | `/api/auth/forgot-password` | 3 requests | 1 hour | Prevent abuse |
| **FMCSA** | `/api/fmcsa/*` | 30 requests | 1 min | Protect external API quota |
| **Upload** | File uploads | 10 uploads | 1 hour | Prevent storage abuse |
| **Listing Creation** | `POST /api/listings` | 5 listings | 1 hour | Prevent spam |
| **Offers** | `POST /api/offers` | 20 offers | 1 hour | Prevent spam |
| **Messages** | Message endpoints | 60 messages | 1 hour | Prevent spam |
| **Admin** | `/api/admin/*` | 200 requests | 15 min | Higher limit for admins |
| **Webhooks** | `/api/webhooks/*` | 100 requests | 1 min | External services |

## Development Mode

In development (`NODE_ENV=development`), limits are significantly higher:
- Global: 1000 requests / 15 min
- Auth: 100 requests / 15 min

## Response Format

When rate limited, the API returns:

```json
{
  "success": false,
  "error": "Too many requests",
  "message": "You have exceeded the rate limit. Please try again later.",
  "retryAfter": 900
}
```

**HTTP Status:** `429 Too Many Requests`

**Headers:**
- `Retry-After`: Seconds until the limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Storage Backend

| Environment | Storage | Behavior |
|-------------|---------|----------|
| With Redis | Redis | Limits persist across dyno restarts |
| Without Redis | In-memory | Limits reset on dyno restart |

Currently running **without Redis** - limits reset when the server restarts.

## Configuration

Rate limits can be configured via environment variables:

```bash
# Global rate limit window (milliseconds)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes

# Global max requests per window
RATE_LIMIT_MAX_REQUESTS=300
```

## Bypassing Rate Limits

The following are exempt from rate limiting:
- Health check endpoints: `/api/health`, `/api/health/ready`

## Troubleshooting

### "Too many requests" Error

1. **Wait**: The limit will reset after the window expires (check `Retry-After` header)
2. **Restart server**: If urgent, restarting the dyno resets in-memory limits
3. **Check logs**: Rate limit events are logged with severity level

### Viewing Rate Limit Logs

```bash
heroku logs --app mcxchange | grep "Rate limit"
```

## Security Considerations

- Auth endpoints have stricter limits to prevent credential stuffing
- Password reset is very strict (3/hour) to prevent email bombing
- All rate limit violations are logged for security monitoring
- High-severity events (auth brute force) trigger security alerts

## Files

- **Configuration**: `src/middleware/rateLimiter.ts`
- **Applied in**: `src/index.ts` (global), individual route files (specific limiters)
