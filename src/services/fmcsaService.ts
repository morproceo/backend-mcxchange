import { config } from '../config';
import { FMCSACarrierData, FMCSAAuthorityHistory, FMCSAInsuranceHistory } from '../types';

interface FMCSAResponse {
  content?: {
    carrier?: {
      dotNumber: string;
      legalName: string;
      dbaName?: string;
      carrierOperation: {
        carrierOperationDesc: string;
      };
      phyCity: string;
      phyState: string;
      phyStreet: string;
      phone: string;
      safetyRating?: string;
      safetyRatingDate?: string;
      totalDrivers: number;
      totalPowerUnits: number;
      mcs150FormDate?: string;
      allowedToOperate: string;
      bipdRequiredAmount: number;
      cargoRequiredAmount: number;
      bondRequiredAmount: number;
      bipdInsuranceOnFile: number;
      cargoInsuranceOnFile: number;
      bondInsuranceOnFile: number;
    };
  };
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
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSAResponse;

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
      // MC lookup requires a different endpoint
      const url = `${this.baseUrl}/carriers/docket-number/${mcNumber}?webKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSAResponse;

      if (!data.content?.carrier) {
        return null;
      }

      return this.mapCarrierData(data.content.carrier);
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
  private mapCarrierData(rawCarrier: NonNullable<FMCSAResponse['content']>['carrier']): FMCSACarrierData {
    if (!rawCarrier) {
      throw new Error('Invalid carrier data');
    }

    return {
      dotNumber: rawCarrier.dotNumber,
      legalName: rawCarrier.legalName,
      dbaName: rawCarrier.dbaName,
      carrierOperation: rawCarrier.carrierOperation?.carrierOperationDesc || 'Unknown',
      hqCity: rawCarrier.phyCity,
      hqState: rawCarrier.phyState,
      physicalAddress: rawCarrier.phyStreet,
      phone: rawCarrier.phone,
      safetyRating: rawCarrier.safetyRating || 'None',
      safetyRatingDate: rawCarrier.safetyRatingDate,
      totalDrivers: rawCarrier.totalDrivers || 0,
      totalPowerUnits: rawCarrier.totalPowerUnits || 0,
      mcs150Date: rawCarrier.mcs150FormDate,
      allowedToOperate: rawCarrier.allowedToOperate,
      bipdRequired: rawCarrier.bipdRequiredAmount || 0,
      cargoRequired: rawCarrier.cargoRequiredAmount || 0,
      bondRequired: rawCarrier.bondRequiredAmount || 0,
      insuranceOnFile: rawCarrier.bipdInsuranceOnFile > 0,
      bipdOnFile: rawCarrier.bipdInsuranceOnFile || 0,
      cargoOnFile: rawCarrier.cargoInsuranceOnFile || 0,
      bondOnFile: rawCarrier.bondInsuranceOnFile || 0,
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
