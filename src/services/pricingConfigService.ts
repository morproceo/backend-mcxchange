import { PlatformSetting } from '../models';

// Pricing configuration types
export interface SubscriptionPlanConfig {
  name: string;
  credits: number;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];
}

export interface CreditPack {
  id: string;
  credits: number;
  price: number;
  stripePriceId: string;
}

export interface PlatformFeesConfig {
  listingFee: number;
  premiumListingFee: number;
  transactionFeePercentage: number;
  depositPercentage: number;
  minDeposit: number;
  maxDeposit: number;
  consultationFee: number;
}

export interface PricingConfig {
  subscriptionPlans: {
    starter: SubscriptionPlanConfig;
    professional: SubscriptionPlanConfig;
    enterprise: SubscriptionPlanConfig;
    vip_access: SubscriptionPlanConfig;
  };
  platformFees: PlatformFeesConfig;
  creditPacks: CreditPack[];
}

// Default pricing values
const DEFAULT_PRICING: PricingConfig = {
  subscriptionPlans: {
    starter: {
      name: 'Starter',
      credits: 4,
      priceMonthly: 9.99,
      priceYearly: 95.99,
      stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
      stripePriceIdYearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '',
      features: [
        '4 MC unlock credits per month',
        'Basic marketplace access',
        'Save favorites',
        'Email notifications',
        'Standard support',
      ],
    },
    professional: {
      name: 'Professional',
      credits: 10,
      priceMonthly: 19.99,
      priceYearly: 191.99,
      stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '',
      stripePriceIdYearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || '',
      features: [
        '10 MC unlock credits per month',
        'Priority marketplace access',
        'Save unlimited favorites',
        'Email & SMS notifications',
        'Priority support',
        'Advanced search filters',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      credits: 25,
      priceMonthly: 39.99,
      priceYearly: 383.99,
      stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
      stripePriceIdYearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
      features: [
        '25 MC unlock credits per month',
        'VIP marketplace access',
        'Unlimited favorites',
        'All notification channels',
        'Dedicated support',
        'Advanced analytics',
        'Early access to new listings',
      ],
    },
    vip_access: {
      name: 'VIP Access',
      credits: 999,
      priceMonthly: 399.99,
      priceYearly: 3839.99,
      stripePriceIdMonthly: process.env.STRIPE_PRICE_VIP_ACCESS_MONTHLY || '',
      stripePriceIdYearly: process.env.STRIPE_PRICE_VIP_ACCESS_YEARLY || '',
      features: [
        'All access to MC marketplace',
        'AI-powered due diligence',
        'AI-powered help & support',
        'Credit report access',
        'Refunded after MC purchase',
        'Priority dedicated support',
        'Early access to new listings',
      ],
    },
  },
  platformFees: {
    listingFee: 49.99,
    premiumListingFee: 199.99,
    transactionFeePercentage: 3,
    depositPercentage: 10,
    minDeposit: 500,
    maxDeposit: 10000,
    consultationFee: 100.00,
  },
  creditPacks: [
    { id: 'pack_5', credits: 5, price: 24.99, stripePriceId: '' },
    { id: 'pack_10', credits: 10, price: 44.99, stripePriceId: '' },
    { id: 'pack_25', credits: 25, price: 99.99, stripePriceId: '' },
  ],
};

// Cache for pricing config
let pricingCache: PricingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PricingConfigService {
  /**
   * Get the full pricing configuration
   * Uses cached value if available and not expired
   */
  async getPricingConfig(): Promise<PricingConfig> {
    // Check cache
    if (pricingCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      return pricingCache;
    }

    // Load from database
    const config = await this.loadFromDatabase();

    // Update cache
    pricingCache = config;
    cacheTimestamp = Date.now();

    return config;
  }

  /**
   * Update pricing configuration
   */
  async updatePricingConfig(updates: Partial<PricingConfig>): Promise<PricingConfig> {
    const currentConfig = await this.getPricingConfig();

    // Merge updates
    const newConfig: PricingConfig = {
      subscriptionPlans: {
        ...currentConfig.subscriptionPlans,
        ...(updates.subscriptionPlans || {}),
      },
      platformFees: {
        ...currentConfig.platformFees,
        ...(updates.platformFees || {}),
      },
      creditPacks: updates.creditPacks || currentConfig.creditPacks,
    };

    // Save to database
    await this.saveToDatabase(newConfig);

    // Clear cache
    this.clearCache();

    return newConfig;
  }

  /**
   * Get subscription plans for public API
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlanConfig[]> {
    const config = await this.getPricingConfig();
    return [
      config.subscriptionPlans.starter,
      config.subscriptionPlans.professional,
      config.subscriptionPlans.enterprise,
      config.subscriptionPlans.vip_access,
    ];
  }

  /**
   * Get a specific subscription plan by key
   */
  async getSubscriptionPlan(planKey: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'VIP_ACCESS'): Promise<SubscriptionPlanConfig> {
    const config = await this.getPricingConfig();
    const key = planKey.toLowerCase() as 'starter' | 'professional' | 'enterprise' | 'vip_access';
    return config.subscriptionPlans[key];
  }

  /**
   * Get platform fees
   */
  async getPlatformFees(): Promise<PlatformFeesConfig> {
    const config = await this.getPricingConfig();
    return config.platformFees;
  }

  /**
   * Get credit packs for public API
   */
  async getCreditPacks(): Promise<CreditPack[]> {
    const config = await this.getPricingConfig();
    return config.creditPacks;
  }

  /**
   * Get consultation fee
   */
  async getConsultationFee(): Promise<number> {
    const config = await this.getPricingConfig();
    return config.platformFees.consultationFee;
  }

  /**
   * Get a specific credit pack by ID
   */
  async getCreditPack(packId: string): Promise<CreditPack | null> {
    const config = await this.getPricingConfig();
    return config.creditPacks.find(pack => pack.id === packId) || null;
  }

  /**
   * Get Stripe price ID for a subscription plan
   */
  async getStripePriceId(planKey: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'VIP_ACCESS', isYearly: boolean): Promise<string> {
    const plan = await this.getSubscriptionPlan(planKey);
    return isYearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  }

  /**
   * Clear the pricing cache (call after updates)
   */
  clearCache(): void {
    pricingCache = null;
    cacheTimestamp = 0;
  }

  /**
   * Load pricing config from database
   */
  private async loadFromDatabase(): Promise<PricingConfig> {
    const settings = await PlatformSetting.findAll();
    const settingsMap: Record<string, string> = {};

    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    // Build config from settings, falling back to defaults
    return {
      subscriptionPlans: {
        starter: {
          name: 'Starter',
          credits: this.parseNumber(settingsMap['starter_credits'], DEFAULT_PRICING.subscriptionPlans.starter.credits),
          priceMonthly: this.parseNumber(settingsMap['starter_price_monthly'], DEFAULT_PRICING.subscriptionPlans.starter.priceMonthly),
          priceYearly: this.parseNumber(settingsMap['starter_price_yearly'], DEFAULT_PRICING.subscriptionPlans.starter.priceYearly),
          stripePriceIdMonthly: settingsMap['starter_stripe_monthly'] || DEFAULT_PRICING.subscriptionPlans.starter.stripePriceIdMonthly,
          stripePriceIdYearly: settingsMap['starter_stripe_yearly'] || DEFAULT_PRICING.subscriptionPlans.starter.stripePriceIdYearly,
          features: this.parseJson(settingsMap['starter_features'], DEFAULT_PRICING.subscriptionPlans.starter.features),
        },
        professional: {
          name: 'Professional',
          credits: this.parseNumber(settingsMap['professional_credits'], DEFAULT_PRICING.subscriptionPlans.professional.credits),
          priceMonthly: this.parseNumber(settingsMap['professional_price_monthly'], DEFAULT_PRICING.subscriptionPlans.professional.priceMonthly),
          priceYearly: this.parseNumber(settingsMap['professional_price_yearly'], DEFAULT_PRICING.subscriptionPlans.professional.priceYearly),
          stripePriceIdMonthly: settingsMap['professional_stripe_monthly'] || DEFAULT_PRICING.subscriptionPlans.professional.stripePriceIdMonthly,
          stripePriceIdYearly: settingsMap['professional_stripe_yearly'] || DEFAULT_PRICING.subscriptionPlans.professional.stripePriceIdYearly,
          features: this.parseJson(settingsMap['professional_features'], DEFAULT_PRICING.subscriptionPlans.professional.features),
        },
        enterprise: {
          name: 'Enterprise',
          credits: this.parseNumber(settingsMap['enterprise_credits'], DEFAULT_PRICING.subscriptionPlans.enterprise.credits),
          priceMonthly: this.parseNumber(settingsMap['enterprise_price_monthly'], DEFAULT_PRICING.subscriptionPlans.enterprise.priceMonthly),
          priceYearly: this.parseNumber(settingsMap['enterprise_price_yearly'], DEFAULT_PRICING.subscriptionPlans.enterprise.priceYearly),
          stripePriceIdMonthly: settingsMap['enterprise_stripe_monthly'] || DEFAULT_PRICING.subscriptionPlans.enterprise.stripePriceIdMonthly,
          stripePriceIdYearly: settingsMap['enterprise_stripe_yearly'] || DEFAULT_PRICING.subscriptionPlans.enterprise.stripePriceIdYearly,
          features: this.parseJson(settingsMap['enterprise_features'], DEFAULT_PRICING.subscriptionPlans.enterprise.features),
        },
        vip_access: {
          name: 'VIP Access',
          credits: this.parseNumber(settingsMap['vip_access_credits'], DEFAULT_PRICING.subscriptionPlans.vip_access.credits),
          priceMonthly: this.parseNumber(settingsMap['vip_access_price_monthly'], DEFAULT_PRICING.subscriptionPlans.vip_access.priceMonthly),
          priceYearly: this.parseNumber(settingsMap['vip_access_price_yearly'], DEFAULT_PRICING.subscriptionPlans.vip_access.priceYearly),
          stripePriceIdMonthly: settingsMap['vip_access_stripe_monthly'] || DEFAULT_PRICING.subscriptionPlans.vip_access.stripePriceIdMonthly,
          stripePriceIdYearly: settingsMap['vip_access_stripe_yearly'] || DEFAULT_PRICING.subscriptionPlans.vip_access.stripePriceIdYearly,
          features: this.parseJson(settingsMap['vip_access_features'], DEFAULT_PRICING.subscriptionPlans.vip_access.features),
        },
      },
      platformFees: {
        listingFee: this.parseNumber(settingsMap['listing_fee'], DEFAULT_PRICING.platformFees.listingFee),
        premiumListingFee: this.parseNumber(settingsMap['premium_listing_fee'], DEFAULT_PRICING.platformFees.premiumListingFee),
        transactionFeePercentage: this.parseNumber(settingsMap['transaction_fee_percentage'], DEFAULT_PRICING.platformFees.transactionFeePercentage),
        depositPercentage: this.parseNumber(settingsMap['deposit_percentage'], DEFAULT_PRICING.platformFees.depositPercentage),
        minDeposit: this.parseNumber(settingsMap['min_deposit'], DEFAULT_PRICING.platformFees.minDeposit),
        maxDeposit: this.parseNumber(settingsMap['max_deposit'], DEFAULT_PRICING.platformFees.maxDeposit),
        consultationFee: this.parseNumber(settingsMap['consultation_fee'], DEFAULT_PRICING.platformFees.consultationFee),
      },
      creditPacks: this.parseJson(settingsMap['credit_packs'], DEFAULT_PRICING.creditPacks),
    };
  }

  /**
   * Save pricing config to database
   */
  private async saveToDatabase(config: PricingConfig): Promise<void> {
    const settings: Array<{ key: string; value: string; type: string }> = [
      // Starter plan
      { key: 'starter_credits', value: String(config.subscriptionPlans.starter.credits), type: 'number' },
      { key: 'starter_price_monthly', value: String(config.subscriptionPlans.starter.priceMonthly), type: 'number' },
      { key: 'starter_price_yearly', value: String(config.subscriptionPlans.starter.priceYearly), type: 'number' },
      { key: 'starter_stripe_monthly', value: config.subscriptionPlans.starter.stripePriceIdMonthly, type: 'string' },
      { key: 'starter_stripe_yearly', value: config.subscriptionPlans.starter.stripePriceIdYearly, type: 'string' },
      { key: 'starter_features', value: JSON.stringify(config.subscriptionPlans.starter.features), type: 'json' },

      // Professional plan
      { key: 'professional_credits', value: String(config.subscriptionPlans.professional.credits), type: 'number' },
      { key: 'professional_price_monthly', value: String(config.subscriptionPlans.professional.priceMonthly), type: 'number' },
      { key: 'professional_price_yearly', value: String(config.subscriptionPlans.professional.priceYearly), type: 'number' },
      { key: 'professional_stripe_monthly', value: config.subscriptionPlans.professional.stripePriceIdMonthly, type: 'string' },
      { key: 'professional_stripe_yearly', value: config.subscriptionPlans.professional.stripePriceIdYearly, type: 'string' },
      { key: 'professional_features', value: JSON.stringify(config.subscriptionPlans.professional.features), type: 'json' },

      // Enterprise plan
      { key: 'enterprise_credits', value: String(config.subscriptionPlans.enterprise.credits), type: 'number' },
      { key: 'enterprise_price_monthly', value: String(config.subscriptionPlans.enterprise.priceMonthly), type: 'number' },
      { key: 'enterprise_price_yearly', value: String(config.subscriptionPlans.enterprise.priceYearly), type: 'number' },
      { key: 'enterprise_stripe_monthly', value: config.subscriptionPlans.enterprise.stripePriceIdMonthly, type: 'string' },
      { key: 'enterprise_stripe_yearly', value: config.subscriptionPlans.enterprise.stripePriceIdYearly, type: 'string' },
      { key: 'enterprise_features', value: JSON.stringify(config.subscriptionPlans.enterprise.features), type: 'json' },

      // VIP Access plan
      { key: 'vip_access_credits', value: String(config.subscriptionPlans.vip_access.credits), type: 'number' },
      { key: 'vip_access_price_monthly', value: String(config.subscriptionPlans.vip_access.priceMonthly), type: 'number' },
      { key: 'vip_access_price_yearly', value: String(config.subscriptionPlans.vip_access.priceYearly), type: 'number' },
      { key: 'vip_access_stripe_monthly', value: config.subscriptionPlans.vip_access.stripePriceIdMonthly, type: 'string' },
      { key: 'vip_access_stripe_yearly', value: config.subscriptionPlans.vip_access.stripePriceIdYearly, type: 'string' },
      { key: 'vip_access_features', value: JSON.stringify(config.subscriptionPlans.vip_access.features), type: 'json' },

      // Platform fees
      { key: 'listing_fee', value: String(config.platformFees.listingFee), type: 'number' },
      { key: 'premium_listing_fee', value: String(config.platformFees.premiumListingFee), type: 'number' },
      { key: 'transaction_fee_percentage', value: String(config.platformFees.transactionFeePercentage), type: 'number' },
      { key: 'deposit_percentage', value: String(config.platformFees.depositPercentage), type: 'number' },
      { key: 'min_deposit', value: String(config.platformFees.minDeposit), type: 'number' },
      { key: 'max_deposit', value: String(config.platformFees.maxDeposit), type: 'number' },
      { key: 'consultation_fee', value: String(config.platformFees.consultationFee), type: 'number' },

      // Credit packs
      { key: 'credit_packs', value: JSON.stringify(config.creditPacks), type: 'json' },
    ];

    // Upsert all settings
    for (const setting of settings) {
      await PlatformSetting.upsert({
        key: setting.key,
        value: setting.value,
        type: setting.type,
      });
    }
  }

  // Helper methods for parsing
  private parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private parseJson<T>(value: string | undefined, defaultValue: T): T {
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
}

export const pricingConfigService = new PricingConfigService();
export default pricingConfigService;
