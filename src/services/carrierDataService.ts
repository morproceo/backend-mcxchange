import { config } from '../config';
import {
  MorProCarrierReport,
  InsuranceLeadFilters,
  InsuranceLeadsResult,
} from '../types/carrierData';
import cacheService from './cacheService';
import logger from '../utils/logger';
import { AppError, TooManyRequestsError } from '../middleware/errorHandler';

// A carrier-data provider. Both upstreams expose the same /carriers/:dot/*
// endpoint family (including a bundled /report that returns every section in
// one call); they differ only in base URL, path prefix, and auth header.
interface CarrierUpstream {
  name: string;
  baseUrl: string;
  prefix: string;
  headers(): Record<string, string>;
}

// Legacy MorPro box — holds the marketplace carrier dataset, no /api/v1 prefix,
// authenticated with X-API-Key. No per-month quota.
const legacyUpstream: CarrierUpstream = {
  name: 'legacy',
  baseUrl: config.morproCarrier.baseUrl,
  prefix: '',
  headers(): Record<string, string> {
    const key = config.morproCarrier.apiKey;
    return key ? { 'X-API-Key': key } : {};
  },
};

// MorPro LINQ (Manifest) — same endpoints under an /api/v1 prefix, authenticated
// with X-Manifest-Key. Subject to a monthly call quota.
const linqUpstream: CarrierUpstream = {
  name: 'linq',
  baseUrl: config.morproLinq.baseUrl,
  prefix: '/api/v1',
  headers(): Record<string, string> {
    const key = config.morproLinq.apiKey;
    return key ? { 'X-Manifest-Key': key } : {};
  },
};

// Priority order for full carrier reports: legacy first (has the marketplace
// data, no quota), LINQ as the resilient fallback if the legacy box is down.
const REPORT_UPSTREAMS: CarrierUpstream[] = [legacyUpstream, linqUpstream];

function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Best-effort extraction of the upstream's error code/message for logging.
async function readUpstreamCode(res: Response): Promise<string | undefined> {
  try {
    const body: any = await res.clone().json();
    return body?.code || body?.message;
  } catch {
    return undefined;
  }
}

// Normalize any provider's report body into the full MorProCarrierReport shape.
// The legacy report includes all 14 keys; LINQ's bundled report omits
// fleet/cargo/documents/related, which fall back to null (the UI degrades
// gracefully rather than breaking).
function normalizeReport(raw: any): MorProCarrierReport {
  return {
    carrier: raw.carrier ?? null,
    authority: raw.authority ?? null,
    safety: raw.safety ?? null,
    inspections: raw.inspections ?? null,
    violations: raw.violations ?? null,
    crashes: raw.crashes ?? null,
    insurance: raw.insurance ?? null,
    fleet: raw.fleet ?? null,
    cargo: raw.cargo ?? null,
    documents: raw.documents ?? null,
    related: raw.related ?? null,
    percentiles: raw.percentiles ?? null,
    monitoring: raw.monitoring ?? null,
    compliance: raw.compliance ?? null,
  };
}

type ReportFetch =
  | { kind: 'ok'; report: MorProCarrierReport }
  | { kind: 'notFound' }
  | { kind: 'error'; status: number };

class CarrierDataService {
  /**
   * Fetch the bundled /report from a single upstream. One call replaces the
   * previous 12-endpoint fan-out. Distinguishes a genuine "carrier not found"
   * (404) from an upstream failure (429/401/5xx/unreachable) so the caller can
   * fail over and surface an accurate status instead of masking it as a 404.
   */
  private async fetchBundledReport(up: CarrierUpstream, dotNumber: string): Promise<ReportFetch> {
    const url = `${up.baseUrl}${up.prefix}/carriers/${dotNumber}/report`;

    let res: Response;
    try {
      res = await fetchWithTimeout(url, up.headers());
    } catch {
      logger.warn(`Carrier report upstream '${up.name}' unreachable for DOT ${dotNumber}`);
      return { kind: 'error', status: 503 };
    }

    if (res.ok) {
      const raw: any = await res.json().catch(() => null);
      if (!raw || !raw.carrier) return { kind: 'notFound' };
      return { kind: 'ok', report: normalizeReport(raw) };
    }

    if (res.status === 404) return { kind: 'notFound' };

    const code = await readUpstreamCode(res);
    logger.warn(
      `Carrier report upstream '${up.name}' ${res.status} for DOT ${dotNumber}${code ? ` (${code})` : ''}`
    );
    return { kind: 'error', status: res.status };
  }

  /**
   * Get full carrier report — checks Redis first, then fetches the bundled
   * /report from each upstream in priority order (legacy → LINQ).
   * Returns null only when every upstream reports the carrier does not exist.
   * Throws (with an accurate status) when all upstreams fail for other reasons,
   * so a rate-limit or outage is no longer reported to the client as a 404.
   */
  async getFullReport(dotNumber: string): Promise<MorProCarrierReport | null> {
    // 1. Check Redis cache
    const cached = await cacheService.getCachedCarrierReport<MorProCarrierReport>(dotNumber);
    if (cached) {
      logger.info(`Carrier report cache HIT for DOT ${dotNumber} — serving instantly`);
      return cached;
    }

    const startTime = Date.now();
    let sawRateLimit = false;
    let sawOtherError = false;
    let otherStatus = 0;

    // 2. Try each upstream's bundled /report until one returns data.
    for (const up of REPORT_UPSTREAMS) {
      const result = await this.fetchBundledReport(up, dotNumber);

      if (result.kind === 'ok') {
        // 3. Cache in Redis (24hr TTL)
        await cacheService.cacheCarrierReport(dotNumber, result.report);
        logger.info(
          `Carrier report for DOT ${dotNumber} served by '${up.name}' in ${Date.now() - startTime}ms (1 upstream call)`
        );
        return result.report;
      }

      if (result.kind === 'error') {
        if (result.status === 429) sawRateLimit = true;
        else {
          sawOtherError = true;
          otherStatus = result.status;
        }
      }
      // notFound → fall through to the next upstream
    }

    // 4. No upstream returned data — surface the real reason.
    if (!sawRateLimit && !sawOtherError) {
      // Every upstream returned 404 — carrier genuinely does not exist.
      logger.warn(`Carrier not found for DOT ${dotNumber} on any upstream`);
      return null;
    }
    if (sawRateLimit) {
      throw new TooManyRequestsError('Carrier data provider quota exceeded — please try again shortly.');
    }
    if (otherStatus === 401 || otherStatus === 403) {
      throw new AppError('Carrier data provider authentication failed', 502, 'UPSTREAM_AUTH');
    }
    throw new AppError('Carrier data provider is temporarily unavailable', 502, 'UPSTREAM_UNAVAILABLE');
  }

  /**
   * Cross-carrier insurance lead search.
   * Proxies the MorPro LINQ /api/v1/carriers/search endpoint (which runs the same
   * pending/expiring derivation we apply per-DOT, but across all carriers).
   * Cached in Redis for 1h keyed by the serialized filter set.
   */
  async searchInsuranceLeads(
    filters: InsuranceLeadFilters,
    page = 1,
    limit = 25
  ): Promise<InsuranceLeadsResult | null> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);

    const params = new URLSearchParams();
    if (filters.insuranceStatus) params.set('insuranceStatus', filters.insuranceStatus);
    if (filters.expiringWithinDays != null)
      params.set('expiringWithinDays', String(filters.expiringWithinDays));
    if (filters.state) params.set('state', filters.state);
    if (filters.minUnits != null) params.set('minUnits', String(filters.minUnits));
    if (filters.maxUnits != null) params.set('maxUnits', String(filters.maxUnits));
    if (filters.minSafety) params.set('minSafety', filters.minSafety);
    if (filters.sort) params.set('sort', filters.sort);
    params.set('page', String(safePage));
    params.set('limit', String(safeLimit));

    const query = params.toString();
    const cacheKey = `insurance_leads:${query}`;

    try {
      const cached = await cacheService.get<InsuranceLeadsResult>(cacheKey);
      if (cached) {
        logger.info(`Insurance leads cache HIT (${query})`);
        return cached;
      }

      const url = `${linqUpstream.baseUrl}${linqUpstream.prefix}/carriers/search?${query}`;
      const res = await fetchWithTimeout(url, linqUpstream.headers());
      if (!res.ok) {
        logger.warn(`MorPro insurance lead search failed: ${res.status} (${query})`);
        return null;
      }

      const data = (await res.json()) as InsuranceLeadsResult;
      // 1h TTL — insurance status changes daily at most
      await cacheService.set(cacheKey, data, 3600);
      return data;
    } catch (error) {
      logger.error('Insurance lead search error', error as Error, { query });
      return null;
    }
  }
}

export const carrierDataService = new CarrierDataService();
export default carrierDataService;
