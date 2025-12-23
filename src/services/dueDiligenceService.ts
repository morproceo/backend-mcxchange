import { fmcsaService } from './fmcsaService';
import { creditsafeService } from './creditsafeService';
import { FMCSACarrierData, FMCSAAuthorityHistory, FMCSAInsuranceHistory } from '../types';

// Score weights for recommendation calculation
const SCORE_WEIGHTS = {
  // FMCSA factors (50% total)
  fmcsa: {
    allowedToOperate: 15,      // Must be allowed to operate
    safetyRating: 10,          // Safety rating score
    insuranceOnFile: 10,       // Has required insurance
    authorityStatus: 10,       // Authority is active
    yearsInBusiness: 5,        // Longevity bonus
  },
  // Credit factors (35% total)
  credit: {
    creditScore: 15,           // Credit rating
    noLegalFilings: 10,        // No judgments/liens
    noUCC: 5,                  // No cautionary UCC
    noBankruptcy: 5,           // No bankruptcy
  },
  // Compliance factors (15% total)
  compliance: {
    validMCS150: 5,            // Recent MCS-150 filing
    adequateFleet: 5,          // Has trucks/drivers
    noOFAC: 5,                 // Not on OFAC list
  },
};

export interface DueDiligenceResult {
  // Identifiers
  mcNumber: string;
  dotNumber?: string;

  // Overall Assessment
  recommendationScore: number;         // 0-100
  recommendationStatus: 'approved' | 'review' | 'rejected';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;

  // FMCSA Data
  fmcsa: {
    carrier: FMCSACarrierData | null;
    authority: FMCSAAuthorityHistory | null;
    insurance: FMCSAInsuranceHistory[] | null;
    score: number;
    factors: ScoreFactor[];
  };

  // Creditsafe Data
  creditsafe: {
    companyFound: boolean;
    companyName?: string;
    connectId?: string;
    creditScore?: number;
    creditRating?: string;
    creditLimit?: number;
    riskDescription?: string;
    legalFilings: {
      judgments: number;
      taxLiens: number;
      uccFilings: number;
      cautionaryUCC: number;
      bankruptcy: boolean;
      suits: number;
    };
    negativeInformation?: {
      possibleOfac?: boolean;
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
    };
    yearsInBusiness?: string;
    employees?: string;
    score: number;
    factors: ScoreFactor[];
    fullReport?: any;
  };

  // Risk Factors
  riskFactors: RiskFactor[];
  positiveFactors: string[];

  // Timestamps
  analyzedAt: string;
}

interface ScoreFactor {
  name: string;
  points: number;
  maxPoints: number;
  status: 'pass' | 'fail' | 'warning' | 'na';
  detail?: string;
}

interface RiskFactor {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'fmcsa' | 'credit' | 'compliance';
  message: string;
}

class DueDiligenceService {
  /**
   * Run comprehensive due diligence on an MC number
   */
  async analyze(mcNumber: string): Promise<DueDiligenceResult> {
    console.log(`[DueDiligence] Starting analysis for MC: ${mcNumber}`);

    // Clean the MC number
    const cleanMC = mcNumber.replace(/[^0-9]/g, '');

    // Run FMCSA and Creditsafe lookups in parallel
    const [fmcsaResult, creditsafeResult] = await Promise.all([
      this.analyzeFMCSA(cleanMC),
      this.analyzeCreditsafe(cleanMC),
    ]);

    // Calculate overall scores
    const totalFmcsaScore = fmcsaResult.score;
    const totalCreditsafeScore = creditsafeResult.score;

    // Calculate recommendation score (weighted average)
    const fmcsaWeight = 0.55;  // FMCSA is slightly more important for trucking
    const creditWeight = 0.45;

    let recommendationScore = Math.round(
      (totalFmcsaScore * fmcsaWeight) + (totalCreditsafeScore * creditWeight)
    );

    // Cap at 100
    recommendationScore = Math.min(100, Math.max(0, recommendationScore));

    // Determine status and risk level
    const { status, riskLevel } = this.determineStatus(
      recommendationScore,
      fmcsaResult,
      creditsafeResult
    );

    // Collect risk factors
    const riskFactors = this.collectRiskFactors(fmcsaResult, creditsafeResult);
    const positiveFactors = this.collectPositiveFactors(fmcsaResult, creditsafeResult);

    // Generate summary
    const summary = this.generateSummary(
      recommendationScore,
      status,
      fmcsaResult,
      creditsafeResult,
      riskFactors
    );

    return {
      mcNumber: cleanMC,
      dotNumber: fmcsaResult.carrier?.dotNumber,
      recommendationScore,
      recommendationStatus: status,
      riskLevel,
      summary,
      fmcsa: fmcsaResult,
      creditsafe: creditsafeResult,
      riskFactors,
      positiveFactors,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyze FMCSA data and calculate score
   */
  private async analyzeFMCSA(mcNumber: string): Promise<DueDiligenceResult['fmcsa']> {
    const factors: ScoreFactor[] = [];
    let totalScore = 0;

    // Get carrier snapshot
    const snapshot = await fmcsaService.getCarrierSnapshot(mcNumber, 'MC');
    const { carrier, authority, insurance } = snapshot;

    if (!carrier) {
      // MC not found - critical failure
      factors.push({
        name: 'MC Number Valid',
        points: 0,
        maxPoints: 50,
        status: 'fail',
        detail: 'MC number not found in FMCSA database',
      });

      return {
        carrier: null,
        authority: null,
        insurance: null,
        score: 0,
        factors,
      };
    }

    // Factor 1: Allowed to Operate
    const isAllowed = carrier.allowedToOperate === 'Y';
    factors.push({
      name: 'Allowed to Operate',
      points: isAllowed ? SCORE_WEIGHTS.fmcsa.allowedToOperate : 0,
      maxPoints: SCORE_WEIGHTS.fmcsa.allowedToOperate,
      status: isAllowed ? 'pass' : 'fail',
      detail: isAllowed ? 'Active operating authority' : 'Not authorized to operate',
    });
    totalScore += isAllowed ? SCORE_WEIGHTS.fmcsa.allowedToOperate : 0;

    // Factor 2: Safety Rating
    const safetyRating = carrier.safetyRating?.toLowerCase() || 'none';
    let safetyPoints = 0;
    let safetyStatus: 'pass' | 'warning' | 'fail' | 'na' = 'na';

    if (safetyRating === 'satisfactory') {
      safetyPoints = SCORE_WEIGHTS.fmcsa.safetyRating;
      safetyStatus = 'pass';
    } else if (safetyRating === 'conditional') {
      safetyPoints = SCORE_WEIGHTS.fmcsa.safetyRating * 0.5;
      safetyStatus = 'warning';
    } else if (safetyRating === 'unsatisfactory') {
      safetyPoints = 0;
      safetyStatus = 'fail';
    } else {
      // No rating - give partial credit
      safetyPoints = SCORE_WEIGHTS.fmcsa.safetyRating * 0.7;
      safetyStatus = 'na';
    }

    factors.push({
      name: 'Safety Rating',
      points: safetyPoints,
      maxPoints: SCORE_WEIGHTS.fmcsa.safetyRating,
      status: safetyStatus,
      detail: `Rating: ${carrier.safetyRating || 'Not Rated'}`,
    });
    totalScore += safetyPoints;

    // Factor 3: Insurance on File
    const hasInsurance = carrier.insuranceOnFile && carrier.bipdOnFile > 0;
    factors.push({
      name: 'Insurance on File',
      points: hasInsurance ? SCORE_WEIGHTS.fmcsa.insuranceOnFile : 0,
      maxPoints: SCORE_WEIGHTS.fmcsa.insuranceOnFile,
      status: hasInsurance ? 'pass' : 'fail',
      detail: hasInsurance
        ? `BIPD: $${(carrier.bipdOnFile || 0).toLocaleString()}`
        : 'No insurance on file',
    });
    totalScore += hasInsurance ? SCORE_WEIGHTS.fmcsa.insuranceOnFile : 0;

    // Factor 4: Authority Status
    const authorityActive = authority?.commonAuthorityStatus === 'ACTIVE' ||
                           authority?.contractAuthorityStatus === 'ACTIVE';
    factors.push({
      name: 'Authority Status',
      points: authorityActive ? SCORE_WEIGHTS.fmcsa.authorityStatus : 0,
      maxPoints: SCORE_WEIGHTS.fmcsa.authorityStatus,
      status: authorityActive ? 'pass' : 'warning',
      detail: authority?.commonAuthorityStatus || 'Unknown',
    });
    totalScore += authorityActive ? SCORE_WEIGHTS.fmcsa.authorityStatus : 0;

    // Factor 5: Years in Business (based on MCS-150 date)
    let yearsBonus = 0;
    if (carrier.mcs150Date) {
      const mcsDate = new Date(carrier.mcs150Date);
      const yearsActive = (Date.now() - mcsDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (yearsActive >= 3) yearsBonus = SCORE_WEIGHTS.fmcsa.yearsInBusiness;
      else if (yearsActive >= 1) yearsBonus = SCORE_WEIGHTS.fmcsa.yearsInBusiness * 0.5;
    }

    factors.push({
      name: 'Business Longevity',
      points: yearsBonus,
      maxPoints: SCORE_WEIGHTS.fmcsa.yearsInBusiness,
      status: yearsBonus > 0 ? 'pass' : 'warning',
      detail: carrier.mcs150Date ? `MCS-150: ${carrier.mcs150Date}` : 'No MCS-150 on file',
    });
    totalScore += yearsBonus;

    // Normalize to 100
    const maxFmcsaScore = Object.values(SCORE_WEIGHTS.fmcsa).reduce((a, b) => a + b, 0);
    const normalizedScore = Math.round((totalScore / maxFmcsaScore) * 100);

    return {
      carrier,
      authority,
      insurance,
      score: normalizedScore,
      factors,
    };
  }

  /**
   * Analyze Creditsafe data and calculate score
   */
  private async analyzeCreditsafe(mcNumber: string): Promise<DueDiligenceResult['creditsafe']> {
    const factors: ScoreFactor[] = [];
    let totalScore = 0;

    try {
      // First, we need to get company info from FMCSA to search Creditsafe
      const fmcsaCarrier = await fmcsaService.lookupByMC(mcNumber);

      if (!fmcsaCarrier) {
        factors.push({
          name: 'Credit Report',
          points: 0,
          maxPoints: 35,
          status: 'na',
          detail: 'Unable to identify company for credit check',
        });

        return {
          companyFound: false,
          legalFilings: {
            judgments: 0,
            taxLiens: 0,
            uccFilings: 0,
            cautionaryUCC: 0,
            bankruptcy: false,
            suits: 0,
          },
          score: 50, // Give neutral score if can't check
          factors,
        };
      }

      // Search Creditsafe by company name and state
      const searchResults = await creditsafeService.searchCompanies({
        countries: 'US',
        name: fmcsaCarrier.legalName,
        state: fmcsaCarrier.hqState,
        pageSize: 5,
      });

      if (!searchResults.companies || searchResults.companies.length === 0) {
        factors.push({
          name: 'Credit Report',
          points: 0,
          maxPoints: 35,
          status: 'warning',
          detail: `Company "${fmcsaCarrier.legalName}" not found in Creditsafe`,
        });

        return {
          companyFound: false,
          companyName: fmcsaCarrier.legalName,
          legalFilings: {
            judgments: 0,
            taxLiens: 0,
            uccFilings: 0,
            cautionaryUCC: 0,
            bankruptcy: false,
            suits: 0,
          },
          score: 50,
          factors,
        };
      }

      // Get the best matching company
      const company = searchResults.companies[0];
      const connectId = company.id;

      if (!connectId) {
        throw new Error('Company found but missing connect ID');
      }

      // Get full credit report
      const report = await creditsafeService.getCreditReport(connectId, {
        includeIndicators: true,
      });

      // Extract credit data - cast to any for US-specific fields not in types
      const reportAny = report as any;
      const creditScore = report.creditScore?.currentCreditRating;
      const numericScore = parseInt(creditScore?.providerValue?.value || '0') || 0;
      const legalFilings = reportAny.negativeInformation?.legalFilingSummary || {};
      const branchFilings = reportAny.negativeInformation?.legalFilingBranchSummary || {};
      const additionalInfo = reportAny.additionalInformation || {};

      // Factor 1: Credit Score (0-100 scale)
      let creditPoints = 0;
      if (numericScore >= 70) creditPoints = SCORE_WEIGHTS.credit.creditScore;
      else if (numericScore >= 50) creditPoints = SCORE_WEIGHTS.credit.creditScore * 0.7;
      else if (numericScore >= 30) creditPoints = SCORE_WEIGHTS.credit.creditScore * 0.4;
      else if (numericScore > 0) creditPoints = SCORE_WEIGHTS.credit.creditScore * 0.2;

      factors.push({
        name: 'Credit Score',
        points: creditPoints,
        maxPoints: SCORE_WEIGHTS.credit.creditScore,
        status: numericScore >= 60 ? 'pass' : numericScore >= 40 ? 'warning' : 'fail',
        detail: `Score: ${numericScore} (${creditScore?.commonDescription || 'N/A'})`,
      });
      totalScore += creditPoints;

      // Factor 2: Legal Filings
      const hasJudgments = (legalFilings.judgmentFilings || 0) > 0;
      const hasTaxLiens = (legalFilings.taxLienFilings || 0) > 0;
      const legalClean = !hasJudgments && !hasTaxLiens;

      factors.push({
        name: 'No Legal Filings',
        points: legalClean ? SCORE_WEIGHTS.credit.noLegalFilings : 0,
        maxPoints: SCORE_WEIGHTS.credit.noLegalFilings,
        status: legalClean ? 'pass' : 'fail',
        detail: legalClean
          ? 'No judgments or tax liens'
          : `Judgments: ${legalFilings.judgmentFilings || 0}, Liens: ${legalFilings.taxLienFilings || 0}`,
      });
      totalScore += legalClean ? SCORE_WEIGHTS.credit.noLegalFilings : 0;

      // Factor 3: UCC Filings
      const totalUCC = (legalFilings.uccFilings || 0) + (branchFilings.uccFilings || 0);
      const cautionaryUCC = (legalFilings.cautionaryUCCFilings || 0) + (branchFilings.cautionaryUCCFilings || 0);
      const uccOk = cautionaryUCC === 0;

      factors.push({
        name: 'UCC Status',
        points: uccOk ? SCORE_WEIGHTS.credit.noUCC : 0,
        maxPoints: SCORE_WEIGHTS.credit.noUCC,
        status: uccOk ? 'pass' : cautionaryUCC > 2 ? 'fail' : 'warning',
        detail: `UCC Filings: ${totalUCC}, Cautionary: ${cautionaryUCC}`,
      });
      totalScore += uccOk ? SCORE_WEIGHTS.credit.noUCC : 0;

      // Factor 4: No Bankruptcy
      const hasBankruptcy = legalFilings.bankruptcy === true;

      factors.push({
        name: 'No Bankruptcy',
        points: !hasBankruptcy ? SCORE_WEIGHTS.credit.noBankruptcy : 0,
        maxPoints: SCORE_WEIGHTS.credit.noBankruptcy,
        status: hasBankruptcy ? 'fail' : 'pass',
        detail: hasBankruptcy ? 'Bankruptcy on file' : 'No bankruptcy',
      });
      totalScore += !hasBankruptcy ? SCORE_WEIGHTS.credit.noBankruptcy : 0;

      // Normalize to 100
      const maxCreditScore = Object.values(SCORE_WEIGHTS.credit).reduce((a, b) => a + b, 0);
      const normalizedScore = Math.round((totalScore / maxCreditScore) * 100);

      // Build negative information object with all available data
      const negativeInfo = reportAny.negativeInformation || {};
      const negativeInformation: any = {
        possibleOfac: negativeInfo.possibleOfac || false,
        legalFilingSummary: negativeInfo.legalFilingSummary || undefined,
        legalFilingGroupSummary: negativeInfo.legalFilingGroupSummary || undefined,
        legalFilingBranchSummary: negativeInfo.legalFilingBranchSummary || undefined,
      };

      // Extract UCC filings details if available
      if (negativeInfo.uccFilings && Array.isArray(negativeInfo.uccFilings)) {
        negativeInformation.uccFilings = negativeInfo.uccFilings.map((ucc: any) => ({
          filedDate: ucc.filedDate,
          filingType: ucc.filingType,
          filingNumber: ucc.filingNumber,
          jurisdiction: ucc.jurisdiction,
          filingOffice: ucc.filingOffice,
          debtorName: ucc.debtorName,
          debtorAddress: ucc.debtorAddress,
          relatedDocumentNumber: ucc.relatedDocumentNumber,
          status: ucc.status,
          securedParty: ucc.securedParty,
          collateralDescription: ucc.collateralDescription,
        }));
      }

      return {
        companyFound: true,
        companyName: company.name,
        connectId,
        creditScore: numericScore,
        creditRating: creditScore?.commonValue,
        creditLimit: parseInt(String(creditScore?.creditLimit?.value || '0')) || 0,
        riskDescription: creditScore?.commonDescription,
        legalFilings: {
          judgments: legalFilings.judgmentFilings || 0,
          taxLiens: legalFilings.taxLienFilings || 0,
          uccFilings: totalUCC,
          cautionaryUCC,
          bankruptcy: hasBankruptcy,
          suits: legalFilings.suits || 0,
        },
        negativeInformation,
        yearsInBusiness: additionalInfo.misc?.yearsInBusiness,
        employees: reportAny.otherInformation?.employeesInformation?.[0]?.numberOfEmployees,
        score: normalizedScore,
        factors,
        fullReport: report,
      };

    } catch (error) {
      console.error('[DueDiligence] Creditsafe error:', error);

      factors.push({
        name: 'Credit Report',
        points: 0,
        maxPoints: 35,
        status: 'na',
        detail: 'Error fetching credit report',
      });

      return {
        companyFound: false,
        legalFilings: {
          judgments: 0,
          taxLiens: 0,
          uccFilings: 0,
          cautionaryUCC: 0,
          bankruptcy: false,
          suits: 0,
        },
        score: 50,
        factors,
      };
    }
  }

  /**
   * Determine recommendation status and risk level
   */
  private determineStatus(
    score: number,
    fmcsaResult: DueDiligenceResult['fmcsa'],
    creditsafeResult: DueDiligenceResult['creditsafe']
  ): { status: 'approved' | 'review' | 'rejected'; riskLevel: 'low' | 'medium' | 'high' | 'critical' } {

    // Critical failures that result in rejection
    if (!fmcsaResult.carrier) {
      return { status: 'rejected', riskLevel: 'critical' };
    }

    if (fmcsaResult.carrier.allowedToOperate !== 'Y') {
      return { status: 'rejected', riskLevel: 'critical' };
    }

    if (creditsafeResult.legalFilings.bankruptcy) {
      return { status: 'rejected', riskLevel: 'critical' };
    }

    // Score-based determination
    if (score >= 75) {
      return { status: 'approved', riskLevel: 'low' };
    } else if (score >= 60) {
      return { status: 'approved', riskLevel: 'medium' };
    } else if (score >= 45) {
      return { status: 'review', riskLevel: 'medium' };
    } else if (score >= 30) {
      return { status: 'review', riskLevel: 'high' };
    } else {
      return { status: 'rejected', riskLevel: 'high' };
    }
  }

  /**
   * Collect risk factors from analysis
   */
  private collectRiskFactors(
    fmcsaResult: DueDiligenceResult['fmcsa'],
    creditsafeResult: DueDiligenceResult['creditsafe']
  ): RiskFactor[] {
    const risks: RiskFactor[] = [];

    // FMCSA risks
    if (!fmcsaResult.carrier) {
      risks.push({
        severity: 'critical',
        category: 'fmcsa',
        message: 'MC number not found in FMCSA database',
      });
    } else {
      if (fmcsaResult.carrier.allowedToOperate !== 'Y') {
        risks.push({
          severity: 'critical',
          category: 'fmcsa',
          message: 'Carrier not authorized to operate',
        });
      }

      if (fmcsaResult.carrier.safetyRating === 'Unsatisfactory') {
        risks.push({
          severity: 'high',
          category: 'fmcsa',
          message: 'Unsatisfactory safety rating',
        });
      } else if (fmcsaResult.carrier.safetyRating === 'Conditional') {
        risks.push({
          severity: 'medium',
          category: 'fmcsa',
          message: 'Conditional safety rating',
        });
      }

      if (!fmcsaResult.carrier.insuranceOnFile) {
        risks.push({
          severity: 'high',
          category: 'fmcsa',
          message: 'No insurance on file with FMCSA',
        });
      }
    }

    // Credit risks
    if (creditsafeResult.legalFilings.bankruptcy) {
      risks.push({
        severity: 'critical',
        category: 'credit',
        message: 'Bankruptcy on file',
      });
    }

    if (creditsafeResult.legalFilings.judgments > 0) {
      risks.push({
        severity: 'high',
        category: 'credit',
        message: `${creditsafeResult.legalFilings.judgments} judgment(s) on file`,
      });
    }

    if (creditsafeResult.legalFilings.taxLiens > 0) {
      risks.push({
        severity: 'high',
        category: 'credit',
        message: `${creditsafeResult.legalFilings.taxLiens} tax lien(s) on file`,
      });
    }

    if (creditsafeResult.legalFilings.cautionaryUCC > 0) {
      risks.push({
        severity: 'medium',
        category: 'credit',
        message: `${creditsafeResult.legalFilings.cautionaryUCC} cautionary UCC filing(s)`,
      });
    }

    if (creditsafeResult.creditScore && creditsafeResult.creditScore < 40) {
      risks.push({
        severity: 'high',
        category: 'credit',
        message: `Low credit score: ${creditsafeResult.creditScore}`,
      });
    }

    return risks;
  }

  /**
   * Collect positive factors
   */
  private collectPositiveFactors(
    fmcsaResult: DueDiligenceResult['fmcsa'],
    creditsafeResult: DueDiligenceResult['creditsafe']
  ): string[] {
    const positives: string[] = [];

    if (fmcsaResult.carrier?.allowedToOperate === 'Y') {
      positives.push('Active operating authority');
    }

    if (fmcsaResult.carrier?.safetyRating === 'Satisfactory') {
      positives.push('Satisfactory safety rating');
    }

    if (fmcsaResult.carrier?.insuranceOnFile) {
      positives.push('Insurance on file with FMCSA');
    }

    if (fmcsaResult.authority?.commonAuthorityStatus === 'ACTIVE') {
      positives.push('Active common authority');
    }

    if (creditsafeResult.creditScore && creditsafeResult.creditScore >= 70) {
      positives.push(`Strong credit score: ${creditsafeResult.creditScore}`);
    }

    if (!creditsafeResult.legalFilings.bankruptcy &&
        creditsafeResult.legalFilings.judgments === 0 &&
        creditsafeResult.legalFilings.taxLiens === 0) {
      positives.push('Clean legal record');
    }

    if (creditsafeResult.yearsInBusiness) {
      positives.push(`${creditsafeResult.yearsInBusiness} in business`);
    }

    return positives;
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    score: number,
    status: 'approved' | 'review' | 'rejected',
    fmcsaResult: DueDiligenceResult['fmcsa'],
    creditsafeResult: DueDiligenceResult['creditsafe'],
    risks: RiskFactor[]
  ): string {
    const criticalRisks = risks.filter(r => r.severity === 'critical');
    const highRisks = risks.filter(r => r.severity === 'high');

    if (status === 'rejected') {
      if (criticalRisks.length > 0) {
        return `Rejected due to critical issues: ${criticalRisks.map(r => r.message).join(', ')}. This carrier does not meet minimum requirements for listing.`;
      }
      return `Rejected due to low overall score (${score}/100). Multiple risk factors identified that require attention before listing.`;
    }

    if (status === 'review') {
      return `Manual review recommended. Score: ${score}/100. ${highRisks.length} high-risk factor(s) identified. FMCSA data ${fmcsaResult.carrier ? 'verified' : 'unavailable'}, credit check ${creditsafeResult.companyFound ? 'completed' : 'pending'}.`;
    }

    // Approved
    if (score >= 85) {
      return `Excellent candidate for listing. Score: ${score}/100. Strong FMCSA compliance and credit profile. ${creditsafeResult.companyFound ? 'Credit verified' : ''}.`;
    }

    return `Approved for listing. Score: ${score}/100. ${fmcsaResult.carrier?.legalName || 'Carrier'} meets listing requirements. ${highRisks.length > 0 ? `Note: ${highRisks.length} area(s) for monitoring.` : ''}`;
  }
}

export const dueDiligenceService = new DueDiligenceService();
export default dueDiligenceService;
