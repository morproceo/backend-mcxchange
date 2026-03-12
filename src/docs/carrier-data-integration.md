# Carrier Data Integration (MorPro Carrier API)

## Overview
MCDetailPageV2 loads carrier intelligence data from the MorPro Carrier API and caches responses in Redis with a 24-hour TTL.

## Architecture

```
Frontend (MCDetailPageV2)
  └── useCarrierData(dotNumber)
        └── api.getCarrierReport(dotNumber)
              └── GET /api/carrier-data/report/:dotNumber

Backend (carrierDataService)
  ├── Redis cache check (carrier_report:<dotNumber>)
  ├── If miss → fetch from MorPro API
  │     └── GET http://194.195.92.25:3001/api/carriers/:dot/report
  └── Cache response (24hr TTL)
```

## MorPro API

- **Base URL:** `http://194.195.92.25:3001`
- **Auth:** None (public)
- **Key endpoint:** `GET /api/carriers/:dot/report` — returns all 12 sections in one call
- **Docs:** `http://194.195.92.25:3001/docs`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MORPRO_CARRIER_API_URL` | `http://194.195.92.25:3001` | MorPro Carrier API base URL |
| `VITE_USE_MOCK_CARRIER_DATA` | `false` | Set to `true` to use mock data instead of API |

## Caching

- **Redis key prefix:** `carrier_report:`
- **TTL:** 86400 seconds (24 hours)
- **Cache key format:** `carrier_report:<dotNumber>` (e.g., `carrier_report:3187270`)

### Refresh Cache (Admin)
```bash
curl -X POST http://localhost:8080/api/carrier-data/report/3187270/refresh \
  -H "Authorization: Bearer <token>"
```

## API Endpoints

### GET `/api/carrier-data/report/:dotNumber`
Returns the full carrier report (cached 24hr).

**Response:**
```json
{
  "success": true,
  "data": {
    "carrier": { ... },
    "authority": { ... },
    "safety": { ... },
    "inspections": { ... },
    "violations": { ... },
    "crashes": { ... },
    "insurance": { ... },
    "fleet": { ... },
    "cargo": { ... },
    "documents": { ... },
    "related": { ... },
    "percentiles": { ... }
  }
}
```

### POST `/api/carrier-data/report/:dotNumber/refresh`
Invalidates cache and re-fetches from MorPro API. Requires authentication.

## Frontend Data Flow

1. `useListing(id)` — loads listing data (price, seller, status) from Domilea DB
2. `useCarrierData(listing.dotNumber)` — loads carrier intelligence from MorPro API
3. `carrierDataMapper.ts` — maps raw API response to V2 TypeScript interfaces
4. `CarrierDataContext` — provides mapped data to all tab sub-components

## Field Mapping (Key Conversions)

| MorPro API Field | V2 Interface Field | Conversion |
|------------------|-------------------|------------|
| `operatingStatus` "A"/"I" | `operatingStatus` "authorized"/"not-authorized" | Letter → word |
| `safetyRating` "Satisfactory" | `safetyRating` "satisfactory" | Lowercase |
| `location.city` + `location.state` | `location` "City, State" | Object → string |
| `yearsActive` "13.2" | `yearsActive` 13.2 | String → number |
| `inspectionCount` | `inspections` | Rename |
| `totalOOS` | `oosCount` | Rename |
| `unique_id` | `id` | Rename |
| `oos_total` | `oosViolations` | Rename |

## Fields Not Yet Available

These fields return null/0/empty from the API and will be populated in future:
- `carrierHealthScore` — MorPro proprietary score (not built yet)
- `trustScore`, `riskScore` — MorPro proprietary (not built yet)
- `smartwayFlag`, `carbtruFlag` — EPA/CARB integration (not built)
- `issScore` — Not publicly available
- `monitoringAlerts` — Needs new database tables
- `riskScoreTrend` — Needs new database tables
- `contactHistory` — Needs new database tables

## Files

### Backend
- `src/config/index.ts` — `morproCarrier.baseUrl` config
- `src/services/cacheService.ts` — `CARRIER_REPORT` cache key + helpers
- `src/types/carrierData.ts` — `MorProCarrierReport` interface
- `src/services/carrierDataService.ts` — Cache-first API client
- `src/controllers/carrierDataController.ts` — Route handlers
- `src/routes/carrierDataRoutes.ts` — Route definitions

### Frontend
- `src/hooks/useCarrierData.ts` — React data hook
- `src/utils/carrierDataMapper.ts` — API → V2 interface mapper (30+ functions)
- `src/pages/MCDetailPageV2.tsx` — Main page (uses CarrierDataContext)
- `src/services/api.ts` — `getCarrierReport()` method
