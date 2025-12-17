import { Request } from 'express';
import { UserRole } from '../models';

// Extend Express Request with user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: ValidationError[];
  pagination?: PaginationInfo;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Query params for listings
export interface ListingQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  state?: string;
  safetyRating?: string;
  amazonStatus?: string;
  trustLevel?: string;
  verified?: boolean;
  premium?: boolean;
  highwaySetup?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  minYears?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'trust_score' | 'newest' | 'oldest' | 'years_active';
  status?: string;
  sellerId?: string;
}

// JWT Payload
export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  iat?: number;
  exp?: number;
}

// FMCSA Types
export interface FMCSACarrierData {
  dotNumber: string;
  mcNumber?: string;
  legalName: string;
  dbaName?: string;
  carrierOperation: string;
  hqCity: string;
  hqState: string;
  physicalAddress: string;
  phone: string;
  safetyRating: string;
  safetyRatingDate?: string;
  totalDrivers: number;
  totalPowerUnits: number;
  mcs150Date?: string;
  allowedToOperate: string;
  bipdRequired: number;
  cargoRequired: number;
  bondRequired: number;
  insuranceOnFile: boolean;
  bipdOnFile: number;
  cargoOnFile: number;
  bondOnFile: number;
  cargoTypes: string[];
}

export interface FMCSAAuthorityHistory {
  commonAuthorityStatus: string;
  commonAuthorityGrantDate?: string;
  commonAuthorityReinstatedDate?: string;
  commonAuthorityRevokedDate?: string;
  contractAuthorityStatus: string;
  contractAuthorityGrantDate?: string;
  brokerAuthorityStatus: string;
  brokerAuthorityGrantDate?: string;
}

export interface FMCSAInsuranceHistory {
  insurerName: string;
  policyNumber: string;
  insuranceType: string;
  coverageAmount: number;
  effectiveDate: string;
  cancellationDate?: string;
  status: string;
}

// Transaction Step Data
export interface TransactionStep {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  title: string;
  description: string;
  completedAt?: Date;
  actorId?: string;
  actorRole?: UserRole;
}

// Offer Data
export interface CreateOfferData {
  listingId: string;
  amount: number;
  message?: string;
  expiresAt?: Date;
  isBuyNow?: boolean;
}

// Listing Data
export interface CreateListingData {
  mcNumber: string;
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  title: string;
  description?: string;
  price: number;
  city: string;
  state: string;
  address?: string;
  yearsActive?: number;
  fleetSize?: number;
  totalDrivers?: number;
  safetyRating?: string;
  insuranceOnFile?: boolean;
  bipdCoverage?: number;
  cargoCoverage?: number;
  bondAmount?: number;
  amazonStatus?: string;
  amazonRelayScore?: string;
  highwaySetup?: boolean;
  sellingWithEmail?: boolean;
  sellingWithPhone?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  cargoTypes?: string[];
  visibility?: string;
  isPremium?: boolean;
}

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  STARTER: {
    name: 'Starter',
    credits: 4,
    priceMonthly: 99,
    priceYearly: 950, // ~20% discount
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '',
  },
  PROFESSIONAL: {
    name: 'Professional',
    credits: 10,
    priceMonthly: 199,
    priceYearly: 1910,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || '',
  },
  ENTERPRISE: {
    name: 'Enterprise',
    credits: 25,
    priceMonthly: 399,
    priceYearly: 3830,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
  },
};

// Platform Fees
export const PLATFORM_FEES = {
  LISTING_FEE: 49.99,
  PREMIUM_LISTING_FEE: 199.99,
  TRANSACTION_FEE_PERCENTAGE: 3, // 3% of sale price
  DEPOSIT_PERCENTAGE: 10, // 10% of agreed price
  MIN_DEPOSIT: 500,
  MAX_DEPOSIT: 10000,
} as const;

// Trust Score Calculation
export const TRUST_SCORE_WEIGHTS = {
  COMPLETED_DEALS: 10, // per deal
  POSITIVE_REVIEW: 5,
  NEGATIVE_REVIEW: -10,
  VERIFIED_SELLER: 20,
  ACCOUNT_AGE_MONTH: 1, // per month
  MAX_SCORE: 100,
  BASE_SCORE: 50,
} as const;
