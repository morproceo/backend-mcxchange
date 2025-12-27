import { PlatformSetting } from '../models';

interface FacebookConfig {
  accessToken: string;
  group1Id: string;
  group1Name: string;
  group2Id: string;
  group2Name: string;
}

interface PostToGroupOptions {
  groupId: string;
  message: string;
  link?: string;
}

interface FacebookApiResponse {
  id?: string;
  error?: {
    message: string;
    code: number;
  };
}

class FacebookService {
  private configCache: FacebookConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get Facebook configuration from database
   */
  async getConfig(): Promise<FacebookConfig> {
    // Check cache
    if (this.configCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.configCache;
    }

    // Load from database
    const [accessTokenSetting, group1IdSetting, group1NameSetting, group2IdSetting, group2NameSetting] = await Promise.all([
      PlatformSetting.findOne({ where: { key: 'facebook_access_token' } }),
      PlatformSetting.findOne({ where: { key: 'facebook_group1_id' } }),
      PlatformSetting.findOne({ where: { key: 'facebook_group1_name' } }),
      PlatformSetting.findOne({ where: { key: 'facebook_group2_id' } }),
      PlatformSetting.findOne({ where: { key: 'facebook_group2_name' } }),
    ]);

    this.configCache = {
      accessToken: accessTokenSetting?.value || '',
      group1Id: group1IdSetting?.value || '',
      group1Name: group1NameSetting?.value || 'Group 1',
      group2Id: group2IdSetting?.value || '',
      group2Name: group2NameSetting?.value || 'Group 2',
    };
    this.cacheTimestamp = Date.now();

    return this.configCache;
  }

  /**
   * Update Facebook configuration
   */
  async updateConfig(config: Partial<FacebookConfig>): Promise<void> {
    const updates: { key: string; value: string }[] = [];

    if (config.accessToken !== undefined) {
      updates.push({ key: 'facebook_access_token', value: config.accessToken });
    }
    if (config.group1Id !== undefined) {
      updates.push({ key: 'facebook_group1_id', value: config.group1Id });
    }
    if (config.group1Name !== undefined) {
      updates.push({ key: 'facebook_group1_name', value: config.group1Name });
    }
    if (config.group2Id !== undefined) {
      updates.push({ key: 'facebook_group2_id', value: config.group2Id });
    }
    if (config.group2Name !== undefined) {
      updates.push({ key: 'facebook_group2_name', value: config.group2Name });
    }

    await Promise.all(
      updates.map(({ key, value }) =>
        PlatformSetting.upsert({ key, value, type: 'string' })
      )
    );

    // Clear cache
    this.configCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if Facebook is configured
   */
  async isConfigured(): Promise<{ configured: boolean; group1: boolean; group2: boolean }> {
    const config = await this.getConfig();
    return {
      configured: !!config.accessToken,
      group1: !!(config.accessToken && config.group1Id),
      group2: !!(config.accessToken && config.group2Id),
    };
  }

  /**
   * Post to a Facebook group
   */
  async postToGroup(options: PostToGroupOptions): Promise<{ success: boolean; postId?: string; error?: string }> {
    const config = await this.getConfig();

    if (!config.accessToken) {
      return {
        success: false,
        error: 'Facebook not configured. Please set access token in settings.',
      };
    }

    if (!options.groupId) {
      return {
        success: false,
        error: 'Group ID is required.',
      };
    }

    try {
      const url = `https://graph.facebook.com/v18.0/${options.groupId}/feed`;

      const body: Record<string, string> = {
        message: options.message,
        access_token: config.accessToken,
      };

      if (options.link) {
        body.link = options.link;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
      });

      const data = await response.json() as FacebookApiResponse;

      if (data.error) {
        console.error('Facebook API error:', data.error);
        return {
          success: false,
          error: data.error.message || 'Failed to post to Facebook group',
        };
      }

      return {
        success: true,
        postId: data.id,
      };
    } catch (error: any) {
      console.error('Facebook service error:', error);
      return {
        success: false,
        error: error.message || 'Failed to connect to Facebook',
      };
    }
  }

  /**
   * Post a listing to Facebook group(s)
   */
  async postListing(
    listing: {
      id: string;
      mcNumber: string;
      title: string;
      askingPrice: number;
      state?: string;
      yearsActive?: number;
      fleetSize?: number;
      safetyRating?: string;
    },
    options: {
      customMessage?: string;
      postToGroup1?: boolean;
      postToGroup2?: boolean;
    }
  ): Promise<{ success: boolean; results: { group1?: { success: boolean; postId?: string; error?: string }; group2?: { success: boolean; postId?: string; error?: string } } }> {
    const config = await this.getConfig();
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.domilea.com';
    const listingUrl = `${frontendUrl}/mc/${listing.id}`;

    // Mask MC number - show only last 3 digits
    const maskedMC = listing.mcNumber.length > 3
      ? '***' + listing.mcNumber.slice(-3)
      : '***';

    // Build the message
    let message = '';

    if (options.customMessage) {
      message = options.customMessage + '\n\n';
    }

    message += `🚛 ${listing.title}\n\n`;
    message += `📋 MC# ${maskedMC}\n`;
    message += `💰 Listing Price: $${listing.askingPrice.toLocaleString()}\n`;

    if (listing.state) {
      message += `📍 State: ${listing.state}\n`;
    }
    if (listing.yearsActive) {
      message += `📅 Years Active: ${listing.yearsActive}\n`;
    }
    if (listing.fleetSize) {
      message += `🚚 Fleet Size: ${listing.fleetSize}\n`;
    }
    if (listing.safetyRating) {
      message += `⭐ Safety Rating: ${listing.safetyRating}\n`;
    }

    message += `\n🔗 View Listing: ${listingUrl}`;

    const results: { group1?: { success: boolean; postId?: string; error?: string }; group2?: { success: boolean; postId?: string; error?: string } } = {};

    // Post to Group 1
    if (options.postToGroup1 && config.group1Id) {
      results.group1 = await this.postToGroup({
        groupId: config.group1Id,
        message,
        link: listingUrl,
      });
    }

    // Post to Group 2
    if (options.postToGroup2 && config.group2Id) {
      results.group2 = await this.postToGroup({
        groupId: config.group2Id,
        message,
        link: listingUrl,
      });
    }

    const success = (results.group1?.success || !options.postToGroup1) &&
                    (results.group2?.success || !options.postToGroup2);

    return { success, results };
  }

  /**
   * Test the Facebook connection
   */
  async testConnection(): Promise<{ success: boolean; userName?: string; error?: string }> {
    const config = await this.getConfig();

    if (!config.accessToken) {
      return {
        success: false,
        error: 'Access token not configured',
      };
    }

    try {
      const url = `https://graph.facebook.com/v18.0/me?access_token=${config.accessToken}`;
      const response = await fetch(url);
      const data = await response.json() as { name?: string; id?: string; error?: { message: string } };

      if (data.error) {
        return {
          success: false,
          error: data.error.message || 'Invalid access token',
        };
      }

      return {
        success: true,
        userName: data.name,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Facebook',
      };
    }
  }
}

export const facebookService = new FacebookService();
export default facebookService;
