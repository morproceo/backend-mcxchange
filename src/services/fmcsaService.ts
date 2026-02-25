import { config } from '../config';
import { FMCSACarrierData, FMCSAAuthorityHistory, FMCSAInsuranceHistory } from '../types';
import logger from '../utils/logger';

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// SMS (Safety Measurement System) data types
export interface FMCSASMSBasic {
  basicName: string;
  basicCode: string;
  percentile: number;
  totalInspections: number;
  totalViolations: number;
  oosInspections: number;
  oosRate: number;
  thresholdPercent: number;
  exceedsThreshold: boolean;
}

export interface FMCSASMSData {
  dotNumber: string;
  totalInspections: number;
  totalDriverInspections: number;
  totalVehicleInspections: number;
  totalHazmatInspections: number;
  totalIepInspections: number;
  driverOosRate: number;
  vehicleOosRate: number;
  driverOosInspections: number;
  vehicleOosInspections: number;
  totalCrashes: number;
  fatalCrashes: number;
  injuryCrashes: number;
  towCrashes: number;
  basics: FMCSASMSBasic[];
  safetyRating: string;
  safetyRatingDate?: string;
  snapshotDate?: string;
}

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
  // Inspection data
  driverInsp?: number;
  driverOosInsp?: number;
  driverOosRate?: number;
  vehicleInsp?: number;
  vehicleOosInsp?: number;
  vehicleOosRate?: number;
  hazmatInsp?: number;
  hazmatOosInsp?: number;
  hazmatOosRate?: number;
  // Crash data
  crashTotal?: number;
  fatalCrash?: number;
  injuryCrash?: number;
  towCrash?: number;
  // BASIC scores
  unsafeDrivingBasic?: number;
  hoursOfServiceBasic?: number;
  driverFitnessBasic?: number;
  controlledSubstancesBasic?: number;
  vehicleMaintenanceBasic?: number;
  hazmatBasic?: number;
  crashIndicatorBasic?: number;
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
      logger.debug('FMCSA DOT lookup URL:', url);
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSASingleResponse;
      logger.debug('FMCSA DOT response:', JSON.stringify(data).substring(0, 500));

      if (!data.content?.carrier) {
        return null;
      }

      return this.mapCarrierData(data.content.carrier);
    } catch (error) {
      logger.warn('FMCSA lookup error:', error);
      return null;
    }
  }

  // Lookup carrier by MC number
  async lookupByMC(mcNumber: string): Promise<FMCSACarrierData | null> {
    try {
      // MC lookup requires a different endpoint - returns array
      const url = `${this.baseUrl}/carriers/docket-number/${mcNumber}?webKey=${this.apiKey}`;
      logger.debug('FMCSA MC lookup URL:', url);
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        console.error(`FMCSA API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as FMCSAArrayResponse;
      logger.debug('FMCSA MC response:', JSON.stringify(data).substring(0, 500));

      // MC lookup returns an array in content
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        logger.debug('FMCSA: No carriers found for MC number');
        return null;
      }

      // Get the first carrier from the array
      const carrierData = data.content[0]?.carrier;
      if (!carrierData) {
        logger.debug('FMCSA: Carrier data missing from response');
        return null;
      }

      return this.mapCarrierData(carrierData);
    } catch (error) {
      logger.warn('FMCSA lookup error:', error);
      return null;
    }
  }

  // Get authority history
  async getAuthorityHistory(dotNumber: string): Promise<FMCSAAuthorityHistory | null> {
    try {
      const url = `${this.baseUrl}/carriers/${dotNumber}/authority?webKey=${this.apiKey}`;
      const response = await fetchWithTimeout(url);

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
        applicationDate: data.content.applicationDt || undefined,
        grantDate: data.content.grantDt || undefined,
        effectiveDate: data.content.effectiveDt || undefined,
        revocationDate: data.content.revssnDt || undefined,
      };
    } catch (error) {
      logger.warn('FMCSA authority history error:', error);
      return null;
    }
  }

  // Get insurance history
  async getInsuranceHistory(dotNumber: string): Promise<FMCSAInsuranceHistory[] | null> {
    try {
      const url = `${this.baseUrl}/carriers/${dotNumber}/insurance?webKey=${this.apiKey}`;
      const response = await fetchWithTimeout(url);

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
      logger.warn('FMCSA insurance history error:', error);
      return null;
    }
  }

  // Get SMS (Safety Measurement System) data - includes inspections, crashes, and BASIC scores
  async getSMSData(dotNumber: string): Promise<FMCSASMSData | null> {
    try {
      // The FMCSA API provides basics endpoint for BASIC scores
      const basicsUrl = `${this.baseUrl}/carriers/${dotNumber}/basics?webKey=${this.apiKey}`;
      const oosUrl = `${this.baseUrl}/carriers/${dotNumber}/oos?webKey=${this.apiKey}`;

      logger.debug('FMCSA SMS lookup URLs:', basicsUrl, oosUrl);

      const [basicsResponse, oosResponse] = await Promise.all([
        fetchWithTimeout(basicsUrl).catch(() => null),
        fetchWithTimeout(oosUrl).catch(() => null),
      ]);

      // Parse BASIC scores
      interface BasicRaw {
        basicsId?: number;
        basBasicCd?: string;
        basBasicDesc?: string;
        basMeasure?: number;
        basTotInsp?: number;
        basTotViol?: number;
        basOosInsp?: number;
        basOosRate?: number;
        basThreshPct?: number;
        basExceedFlag?: string;
      }

      let basics: FMCSASMSBasic[] = [];
      if (basicsResponse?.ok) {
        const basicsData = await basicsResponse.json() as { content?: BasicRaw[] };
        if (basicsData.content && Array.isArray(basicsData.content)) {
          basics = basicsData.content.map((b: BasicRaw) => ({
            basicName: b.basBasicDesc || 'Unknown',
            basicCode: b.basBasicCd || '',
            percentile: b.basMeasure || 0,
            totalInspections: b.basTotInsp || 0,
            totalViolations: b.basTotViol || 0,
            oosInspections: b.basOosInsp || 0,
            oosRate: b.basOosRate || 0,
            thresholdPercent: b.basThreshPct || 0,
            exceedsThreshold: b.basExceedFlag === 'Y',
          }));
        }
      }

      // Parse OOS (Out of Service) data
      interface OOSRaw {
        oosDriverInsp?: number;
        oosDriverOos?: number;
        oosDriverOosRate?: number;
        oosVehicleInsp?: number;
        oosVehicleOos?: number;
        oosVehicleOosRate?: number;
        oosHazmatInsp?: number;
        oosHazmatOos?: number;
        oosIepInsp?: number;
        oosTotInsp?: number;
        oosTotCrashes?: number;
        oosFatalCrashes?: number;
        oosInjCrashes?: number;
        oosTowCrashes?: number;
      }

      let oosData: OOSRaw = {};
      if (oosResponse?.ok) {
        const oosResult = await oosResponse.json() as { content?: OOSRaw };
        if (oosResult.content) {
          oosData = oosResult.content;
        }
      }

      // Calculate totals
      const totalInspections = oosData.oosTotInsp ||
        (oosData.oosDriverInsp || 0) + (oosData.oosVehicleInsp || 0);

      return {
        dotNumber,
        totalInspections,
        totalDriverInspections: oosData.oosDriverInsp || 0,
        totalVehicleInspections: oosData.oosVehicleInsp || 0,
        totalHazmatInspections: oosData.oosHazmatInsp || 0,
        totalIepInspections: oosData.oosIepInsp || 0,
        driverOosRate: oosData.oosDriverOosRate || 0,
        vehicleOosRate: oosData.oosVehicleOosRate || 0,
        driverOosInspections: oosData.oosDriverOos || 0,
        vehicleOosInspections: oosData.oosVehicleOos || 0,
        totalCrashes: oosData.oosTotCrashes || 0,
        fatalCrashes: oosData.oosFatalCrashes || 0,
        injuryCrashes: oosData.oosInjCrashes || 0,
        towCrashes: oosData.oosTowCrashes || 0,
        basics,
        safetyRating: 'N/A', // Will be filled from carrier data
        snapshotDate: new Date().toISOString().split('T')[0],
      };
    } catch (error) {
      logger.warn('FMCSA SMS data error:', error);
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
      // Inspection data
      driverInsp: rawCarrier.driverInsp || 0,
      driverOosInsp: rawCarrier.driverOosInsp || 0,
      driverOosRate: rawCarrier.driverOosRate || 0,
      vehicleInsp: rawCarrier.vehicleInsp || 0,
      vehicleOosInsp: rawCarrier.vehicleOosInsp || 0,
      vehicleOosRate: rawCarrier.vehicleOosRate || 0,
      hazmatInsp: rawCarrier.hazmatInsp || 0,
      hazmatOosInsp: rawCarrier.hazmatOosInsp || 0,
      hazmatOosRate: rawCarrier.hazmatOosRate || 0,
      // Crash data
      crashTotal: rawCarrier.crashTotal || 0,
      fatalCrash: rawCarrier.fatalCrash || 0,
      injuryCrash: rawCarrier.injuryCrash || 0,
      towCrash: rawCarrier.towCrash || 0,
      // BASIC scores
      unsafeDrivingBasic: rawCarrier.unsafeDrivingBasic || 0,
      hoursOfServiceBasic: rawCarrier.hoursOfServiceBasic || 0,
      driverFitnessBasic: rawCarrier.driverFitnessBasic || 0,
      controlledSubstancesBasic: rawCarrier.controlledSubstancesBasic || 0,
      vehicleMaintenanceBasic: rawCarrier.vehicleMaintenanceBasic || 0,
      hazmatBasic: rawCarrier.hazmatBasic || 0,
      crashIndicatorBasic: rawCarrier.crashIndicatorBasic || 0,
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
