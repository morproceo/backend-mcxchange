/**
 * Creditsafe Connect API Service
 *
 * Handles authentication with automatic token caching and renewal.
 * Token expires after ~1 hour. We cache it and automatically re-authenticate
 * when the token expires or a 401 is received.
 */

import { config } from '../config';
import logger from '../utils/logger';

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Creditsafe API response types
interface CreditsafeAuthResponse {
  token: string;
}

interface CreditsafeCompany {
  id: string;
  connectId?: string;
  name: string;
  regNo?: string;
  vatNo?: string;
  address?: {
    simpleValue?: string;
    street?: string;
    city?: string;
    postCode?: string;
    province?: string;
    country?: string;
  };
  status?: string;
  type?: string;
  dateOfLatestAccounts?: string;
  dateOfLatestChange?: string;
  activityCode?: string;
  safeNumber?: string;
  officeType?: string;
  phoneNumbers?: string[];
}

interface CreditsafeCompanySearchResponse {
  totalSize?: number;
  companies?: CreditsafeCompany[];
}

interface CreditsafeCreditScore {
  currentCreditRating?: {
    commonValue?: string;
    commonDescription?: string;
    creditLimit?: {
      currency?: string;
      value?: number;
    };
    providerValue?: {
      maxValue?: string;
      minValue?: string;
      value?: string;
    };
  };
  previousCreditRating?: {
    commonValue?: string;
    commonDescription?: string;
  };
}

interface CreditsafeDirector {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  positions?: Array<{
    positionName?: string;
    dateAppointed?: string;
  }>;
  dateOfBirth?: string;
  address?: {
    simpleValue?: string;
  };
}

interface CreditsafeFinancialStatement {
  yearEndDate?: string;
  numberOfWeeks?: number;
  currency?: string;
  consolidatedAccounts?: boolean;
  profitAndLoss?: {
    revenue?: number;
    operatingProfit?: number;
    profitBeforeTax?: number;
    profitAfterTax?: number;
  };
  balanceSheet?: {
    totalCurrentAssets?: number;
    totalAssets?: number;
    totalCurrentLiabilities?: number;
    totalLiabilities?: number;
    totalShareholdersEquity?: number;
  };
}

interface CreditsafeCreditReport {
  companyId?: string;
  companyIdentification?: {
    basicInformation?: {
      businessName?: string;
      registeredCompanyName?: string;
      companyRegistrationNumber?: string;
      vatRegistrationNumber?: string;
      country?: string;
      companyStatus?: {
        status?: string;
        description?: string;
      };
      principalActivity?: {
        code?: string;
        description?: string;
      };
      contactAddress?: {
        simpleValue?: string;
        street?: string;
        city?: string;
        postCode?: string;
        province?: string;
        country?: string;
      };
      contactTelephone?: string;
      contactWebsite?: string;
    };
  };
  creditScore?: CreditsafeCreditScore;
  directors?: {
    currentDirectors?: CreditsafeDirector[];
  };
  financialStatements?: CreditsafeFinancialStatement[];
  negativeInformation?: {
    possibleOfac?: boolean;
    ccjSummary?: {
      exactRegistered?: number;
      possibleRegistered?: number;
      numberOfExact?: number;
      numberOfPossible?: number;
      totalAmount?: {
        value?: number;
        currency?: string;
      };
    };
    uccFilings?: Array<{
      filedDate?: string;
      filingType?: string;
      filingNumber?: string;
      jurisdiction?: string;
      filingOffice?: string;
      debtorName?: string;
      debtorAddress?: {
        simpleValue?: string;
        street?: string;
        city?: string;
        postalCode?: string;
        province?: string;
      };
      relatedDocumentNumber?: string;
      status?: string;
      securedParty?: {
        name?: string;
        address?: string;
      };
      collateralDescription?: string;
      expirationDate?: string;
    }>;
    legalFilingSummary?: {
      bankruptcy?: boolean;
      taxLienFilings?: number;
      judgmentFilings?: number;
      uccFilings?: number;
      cautionaryUccFilings?: number;
      suits?: number;
      sum?: {
        currency?: string;
        value?: number;
      };
    };
    legalFilingGroupSummary?: {
      bankruptcy?: boolean;
      taxLienFilings?: number;
      judgmentFilings?: number;
      uccFilings?: number;
      cautionaryUccFilings?: number;
      suits?: number;
      sum?: {
        currency?: string;
        value?: number;
      };
    };
    legalFilingBranchSummary?: {
      bankruptcy?: boolean;
      taxLienFilings?: number;
      judgmentFilings?: number;
      uccFilings?: number;
      cautionaryUccFilings?: number;
      suits?: number;
      sum?: {
        currency?: string;
        value?: number;
      };
    };
    judgments?: Array<{
      filedDate?: string;
      caseNumber?: string;
      amount?: number;
      currency?: string;
      plaintiff?: string;
      status?: string;
    }>;
    taxLiens?: Array<{
      filedDate?: string;
      amount?: number;
      currency?: string;
      jurisdiction?: string;
      status?: string;
    }>;
    suits?: Array<{
      filedDate?: string;
      caseNumber?: string;
      plaintiff?: string;
      amount?: number;
      currency?: string;
      status?: string;
    }>;
  };
  paymentData?: {
    dbt?: number; // Days Beyond Terms
    industryDBT?: number;
  };
  additionalInformation?: {
    employeeInformation?: {
      numberOfEmployees?: string | number;
    };
  };
}

// Token cache interface
interface TokenCache {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

class CreditsafeService {
  private baseUrl: string;
  private username: string;
  private password: string;
  private tokenCache: TokenCache | null = null;

  // Token validity buffer (5 minutes before expiry, re-authenticate)
  private readonly TOKEN_BUFFER_MS = 5 * 60 * 1000;
  // Default token TTL (55 minutes - Creditsafe tokens last ~1 hour)
  private readonly DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;

  constructor() {
    this.baseUrl = config.creditsafe?.baseUrl || 'https://connect.creditsafe.com/v1';
    this.username = config.creditsafe?.username || '';
    this.password = config.creditsafe?.password || '';
  }

  /**
   * Check if the cached token is still valid
   */
  private isTokenValid(): boolean {
    if (!this.tokenCache) return false;

    const now = Date.now();
    // Token is valid if we're before expiry minus buffer
    return now < (this.tokenCache.expiresAt - this.TOKEN_BUFFER_MS);
  }

  /**
   * Authenticate with Creditsafe and cache the token
   */
  private async authenticate(): Promise<string> {
    logger.debug('[Creditsafe] Authenticating...');

    if (!this.username || !this.password) {
      throw new Error('Creditsafe credentials not configured');
    }

    const response = await fetchWithTimeout(`${this.baseUrl}/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('[Creditsafe] Authentication failed:', response.status, errorText);
      throw new Error(`Creditsafe authentication failed: ${response.status}`);
    }

    const data = await response.json() as CreditsafeAuthResponse;

    if (!data.token) {
      throw new Error('Creditsafe authentication response missing token');
    }

    // Cache the token with expiration
    const now = Date.now();
    this.tokenCache = {
      token: data.token,
      issuedAt: now,
      expiresAt: now + this.DEFAULT_TOKEN_TTL_MS,
    };

    logger.debug('[Creditsafe] Authentication successful, token cached');
    return data.token;
  }

  /**
   * Get a valid token, authenticating if necessary
   */
  private async getToken(): Promise<string> {
    if (this.isTokenValid() && this.tokenCache) {
      return this.tokenCache.token;
    }

    return this.authenticate();
  }

  /**
   * Make an authenticated request to Creditsafe API
   * Automatically handles token refresh on 401
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<T> {
    const token = await this.getToken();

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - token expired
    if (response.status === 401 && !isRetry) {
      logger.debug('[Creditsafe] Token expired, re-authenticating...');
      // Invalidate cached token
      this.tokenCache = null;
      // Retry the request once with a fresh token
      return this.makeRequest<T>(endpoint, options, true);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Creditsafe] API error: ${response.status}`, errorText);
      throw new Error(`Creditsafe API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search for companies in the Creditsafe database
   */
  async searchCompanies(params: {
    countries: string; // ISO-2 codes, comma-separated (e.g., "US,GB")
    name?: string;
    regNo?: string;
    vatNo?: string;
    postCode?: string;
    city?: string;
    state?: string;
    exact?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<CreditsafeCompanySearchResponse> {
    const searchParams = new URLSearchParams();

    searchParams.set('countries', params.countries);
    if (params.name) searchParams.set('name', params.name);
    if (params.regNo) searchParams.set('regNo', params.regNo);
    if (params.vatNo) searchParams.set('vatNo', params.vatNo);
    if (params.postCode) searchParams.set('postCode', params.postCode);
    if (params.city) searchParams.set('city', params.city);
    if (params.state) searchParams.set('province', params.state);
    if (params.exact !== undefined) searchParams.set('exact', params.exact.toString());
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    return this.makeRequest<CreditsafeCompanySearchResponse>(
      `/companies?${searchParams.toString()}`
    );
  }

  /**
   * Get a full credit report for a company by connectId
   */
  async getCreditReport(connectId: string, options?: {
    language?: string;
    includeIndicators?: boolean;
  }): Promise<CreditsafeCreditReport> {
    const searchParams = new URLSearchParams();

    if (options?.language) searchParams.set('language', options.language);
    if (options?.includeIndicators) searchParams.set('includeIndicators', 'true');

    const query = searchParams.toString();
    const endpoint = `/companies/${encodeURIComponent(connectId)}${query ? `?${query}` : ''}`;

    const response = await this.makeRequest<any>(endpoint);

    // Log the raw response structure for debugging
    logger.debug('[Creditsafe] Raw credit report response keys:', Object.keys(response));

    // Creditsafe API wraps the report in a "report" object
    // Handle both wrapped and unwrapped responses
    const report = response.report || response;

    logger.debug('[Creditsafe] Extracted report keys:', Object.keys(report));

    return report as CreditsafeCreditReport;
  }

  /**
   * Get user's subscription access details
   */
  async getAccess(): Promise<{
    countries?: Array<{
      code: string;
      name: string;
      companyReport?: boolean;
      directorReport?: boolean;
      monitoring?: boolean;
    }>;
  }> {
    return this.makeRequest('/access');
  }

  /**
   * Search for a company and get credit report in one call
   * Convenience method for the admin tool
   */
  async lookupCompany(params: {
    country: string;
    name?: string;
    regNo?: string;
    state?: string;
    city?: string;
  }): Promise<{
    searchResults: CreditsafeCompany[];
    totalResults: number;
  }> {
    const searchResult = await this.searchCompanies({
      countries: params.country,
      name: params.name,
      regNo: params.regNo,
      state: params.state,
      city: params.city,
      pageSize: 10,
    });

    return {
      searchResults: searchResult.companies || [],
      totalResults: searchResult.totalSize || 0,
    };
  }

  /**
   * Get comprehensive credit assessment for a company
   * Used by the admin due diligence tool
   */
  async getCompanyAssessment(connectId: string): Promise<{
    company: CreditsafeCreditReport;
    summary: {
      businessName: string;
      registrationNumber: string | null;
      status: string;
      country: string;
      address: string;
      telephone: string | null;
      website: string | null;
      principalActivity: string | null;
      creditRating: string | null;
      creditRatingDescription: string | null;
      creditLimit: number | null;
      creditLimitCurrency: string | null;
      numberOfEmployees: string | number | null;
      dbt: number | null;
      industryDBT: number | null;
      ccjCount: number;
      ccjTotalAmount: number | null;
      ccjCurrency: string | null;
      directorsCount: number;
      latestFinancialsDate: string | null;
      revenue: number | null;
      profitBeforeTax: number | null;
      totalAssets: number | null;
      totalLiabilities: number | null;
      shareholdersEquity: number | null;
    };
  }> {
    const report = await this.getCreditReport(connectId, {
      includeIndicators: true,
    });

    const basic = report.companyIdentification?.basicInformation;
    const score = report.creditScore?.currentCreditRating;
    const latestFinancials = report.financialStatements?.[0];
    const ccj = report.negativeInformation?.ccjSummary;

    return {
      company: report,
      summary: {
        businessName: basic?.businessName || basic?.registeredCompanyName || 'N/A',
        registrationNumber: basic?.companyRegistrationNumber || null,
        status: basic?.companyStatus?.status || 'Unknown',
        country: basic?.country || 'N/A',
        address: basic?.contactAddress?.simpleValue ||
          [basic?.contactAddress?.street, basic?.contactAddress?.city, basic?.contactAddress?.postCode]
            .filter(Boolean).join(', ') || 'N/A',
        telephone: basic?.contactTelephone || null,
        website: basic?.contactWebsite || null,
        principalActivity: basic?.principalActivity?.description || null,
        creditRating: score?.commonValue || null,
        creditRatingDescription: score?.commonDescription || null,
        creditLimit: score?.creditLimit?.value || null,
        creditLimitCurrency: score?.creditLimit?.currency || null,
        numberOfEmployees: report.additionalInformation?.employeeInformation?.numberOfEmployees || null,
        dbt: report.paymentData?.dbt ?? null,
        industryDBT: report.paymentData?.industryDBT ?? null,
        ccjCount: (ccj?.numberOfExact || 0) + (ccj?.numberOfPossible || 0),
        ccjTotalAmount: ccj?.totalAmount?.value || null,
        ccjCurrency: ccj?.totalAmount?.currency || null,
        directorsCount: report.directors?.currentDirectors?.length || 0,
        latestFinancialsDate: latestFinancials?.yearEndDate || null,
        revenue: latestFinancials?.profitAndLoss?.revenue || null,
        profitBeforeTax: latestFinancials?.profitAndLoss?.profitBeforeTax || null,
        totalAssets: latestFinancials?.balanceSheet?.totalAssets || null,
        totalLiabilities: latestFinancials?.balanceSheet?.totalLiabilities || null,
        shareholdersEquity: latestFinancials?.balanceSheet?.totalShareholdersEquity || null,
      },
    };
  }

  /**
   * Check if the service is configured and can authenticate
   */
  async healthCheck(): Promise<{
    configured: boolean;
    authenticated: boolean;
    error?: string;
  }> {
    const configured = !!(this.username && this.password);

    if (!configured) {
      return { configured: false, authenticated: false, error: 'Creditsafe credentials not configured' };
    }

    try {
      await this.getToken();
      return { configured: true, authenticated: true };
    } catch (error) {
      return {
        configured: true,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
}

export const creditsafeService = new CreditsafeService();
export default creditsafeService;
