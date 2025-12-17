import { config } from '../config';
import { FMCSACarrierData, FMCSAAuthorityHistory, FMCSAInsuranceHistory } from '../types';

interface FMCSACarrierRaw {
  dotNumber: number | string;
  legalName: string;
  dbaName?: string | null;
  carrierOperation?: {
    carrierOperationCode?: string;
    carrierOperationDesc?: string;
  };
  phyCity: string;
  phyState: string;
  phyStreet: string;
  phyZipcode?: string;
  phone?: string;
  safetyRating?: string | null;
  safetyRatingDate?: string | null;
  totalDrivers: number;
  totalPowerUnits: number;
  mcs150FormDate?: string;
  allowedToOperate: string;
  bipdRequiredAmount?: number | string;
  cargoRequiredAmount?: number | string;
  bondRequiredAmount?: number | string;
  bipdInsuranceOnFile?: number | string;
  cargoInsuranceOnFile?: number | string;
  bondInsuranceOnFile?: number | string;
  // Additional fields from actual API
  ein?: number;
  commonAuthorityStatus?: string;
  contractAuthorityStatus?: string;
  brokerAuthorityStatus?: string;
}

// Response for single carrier lookup (by DOT)
interface FMCSASingleResponse {
  content?: {
    carrier?: FMCSACarrierRaw;
  };
}

// Response for docket-number lookup (by MC) - returns array
interface FMCSAArrayResponse {
  content?: Array<{
    carrier?: FMCSACarrierRaw;
  }>;
}

class FMCSAService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.fmcsa.apiKey;
    this.baseUrl = config.fmcsa.baseUrl;
  }

  // Lookup carrier by DOT number
  async lookupByDOT(dotNumber: string): Promise<FMCSACarrierData | null> {
    try {
      const url = `${this.baseUrl}/carriers/${dotNumber}?webKey=${this.apiKey}`;
      console.log('FMCSA DOT lookup URL:', url);
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSASingleResponse;
      console.log('FMCSA DOT response:', JSON.stringify(data).substring(0, 500));

      if (!data.content?.carrier) {
        return null;
      }

      return this.mapCarrierData(data.content.carrier);
    } catch (error) {
      console.error('FMCSA lookup error:', error);
      return null;
    }
  }

  // Lookup carrier by MC number
  async lookupByMC(mcNumber: string): Promise<FMCSACarrierData | null> {
    try {
      // MC lookup requires a different endpoint - returns array
      const url = `${this.baseUrl}/carriers/docket-number/${mcNumber}?webKey=${this.apiKey}`;
      console.log('FMCSA MC lookup URL:', url);
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSAArrayResponse;
      console.log('FMCSA MC response:', JSON.stringify(data).substring(0, 500));

      // MC lookup returns an array in content
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        console.log('FMCSA: No carriers found for MC number');
        return null;
      }

      // Get the first carrier from the array
      const carrierData = data.content[0]?.carrier;
      if (!carrierData) {
        console.log('FMCSA: Carrier data missing from response');
        return null;
      }

      return this.mapCarrierData(carrierData);
    } catch (error) {
      console.error('FMCSA lookup error:', error);
      return null;
    }
  }

  // Get authority history
  async getAuthorityHistory(dotNumber: string): Promise<FMCSAAuthorityHistory | null> {
    try {
      const url = `${this.baseUrl}/carriers/${dotNumber}/authority?webKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { content?: Record<string, string> };

      if (!data.content) {
        return null;
      }

      return {
        commonAuthorityStatus: data.content.commonAuthorityStatus || 'N/A',
        commonAuthorityGrantDate: data.content.commonAuthorityGrantDate,
        commonAuthorityReinstatedDate: data.content.commonAuthorityReinstatedDate,
        commonAuthorityRevokedDate: data.content.commonAuthorityRevokedDate,
        contractAuthorityStatus: data.content.contractAuthorityStatus || 'N/A',
        contractAuthorityGrantDate: data.content.contractAuthorityGrantDate,
        brokerAuthorityStatus: data.content.brokerAuthorityStatus || 'N/A',
        brokerAuthorityGrantDate: data.content.brokerAuthorityGrantDate,
      };
    } catch (error) {
      console.error('FMCSA authority history error:', error);
      return null;
    }
  }

  // Get insurance history
  async getInsuranceHistory(dotNumber: string): Promise<FMCSAInsuranceHistory[] | null> {
    try {
      const url = `${this.baseUrl}/carriers/${dotNumber}/insurance?webKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      interface InsuranceItem {
        insurerName: string;
        policyNumber: string;
        insuranceType: string;
        coverageAmount: number;
        effectiveDate: string;
        cancellationDate?: string;
        status: string;
      }

      const data = await response.json() as { content?: InsuranceItem[] };

      if (!data.content || !Array.isArray(data.content)) {
        return null;
      }

      return data.content.map((insurance: {
        insurerName: string;
        policyNumber: string;
        insuranceType: string;
        coverageAmount: number;
        effectiveDate: string;
        cancellationDate?: string;
        status: string;
      }) => ({
        insurerName: insurance.insurerName,
        policyNumber: insurance.policyNumber,
        insuranceType: insurance.insuranceType,
        coverageAmount: insurance.coverageAmount,
        effectiveDate: insurance.effectiveDate,
        cancellationDate: insurance.cancellationDate,
        status: insurance.status,
      }));
    } catch (error) {
      console.error('FMCSA insurance history error:', error);
      return null;
    }
  }

  // Get full carrier snapshot
  async getCarrierSnapshot(identifier: string, type: 'MC' | 'DOT' = 'DOT'): Promise<{
    carrier: FMCSACarrierData | null;
    authority: FMCSAAuthorityHistory | null;
    insurance: FMCSAInsuranceHistory[] | null;
  }> {
    let carrier: FMCSACarrierData | null = null;

    if (type === 'MC') {
      carrier = await this.lookupByMC(identifier);
    } else {
      carrier = await this.lookupByDOT(identifier);
    }

    if (!carrier) {
      return { carrier: null, authority: null, insurance: null };
    }

    const [authority, insurance] = await Promise.all([
      this.getAuthorityHistory(carrier.dotNumber),
      this.getInsuranceHistory(carrier.dotNumber),
    ]);

    return { carrier, authority, insurance };
  }

  // Map raw API response to our data structure
  private mapCarrierData(rawCarrier: FMCSACarrierRaw): FMCSACarrierData {
    if (!rawCarrier) {
      throw new Error('Invalid carrier data');
    }

    // Helper to parse numbers from string or number
    const toNumber = (val: string | number | undefined | null): number => {
      if (val === null || val === undefined) return 0;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? 0 : num;
    };

    return {
      dotNumber: String(rawCarrier.dotNumber),
      legalName: rawCarrier.legalName,
      dbaName: rawCarrier.dbaName || undefined,
      carrierOperation: rawCarrier.carrierOperation?.carrierOperationDesc || 'Unknown',
      hqCity: rawCarrier.phyCity,
      hqState: rawCarrier.phyState,
      physicalAddress: rawCarrier.phyStreet,
      phone: rawCarrier.phone || '',
      safetyRating: rawCarrier.safetyRating || 'None',
      safetyRatingDate: rawCarrier.safetyRatingDate || undefined,
      totalDrivers: rawCarrier.totalDrivers || 0,
      totalPowerUnits: rawCarrier.totalPowerUnits || 0,
      mcs150Date: rawCarrier.mcs150FormDate,
      allowedToOperate: rawCarrier.allowedToOperate,
      bipdRequired: toNumber(rawCarrier.bipdRequiredAmount),
      cargoRequired: toNumber(rawCarrier.cargoRequiredAmount),
      bondRequired: toNumber(rawCarrier.bondRequiredAmount),
      insuranceOnFile: toNumber(rawCarrier.bipdInsuranceOnFile) > 0,
      bipdOnFile: toNumber(rawCarrier.bipdInsuranceOnFile),
      cargoOnFile: toNumber(rawCarrier.cargoInsuranceOnFile),
      bondOnFile: toNumber(rawCarrier.bondInsuranceOnFile),
      cargoTypes: [], // Would need additional API call to get cargo types
    };
  }

  // Verify MC number is valid and active
  async verifyMC(mcNumber: string): Promise<{
    valid: boolean;
    active: boolean;
    reason?: string;
  }> {
    const carrier = await this.lookupByMC(mcNumber);

    if (!carrier) {
      return { valid: false, active: false, reason: 'MC number not found' };
    }

    const isActive = carrier.allowedToOperate === 'Y';

    return {
      valid: true,
      active: isActive,
      reason: isActive ? undefined : 'Carrier is not allowed to operate',
    };
  }
}

export const fmcsaService = new FMCSAService();
export default fmcsaService;
