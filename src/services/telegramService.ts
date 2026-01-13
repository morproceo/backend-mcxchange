import { PlatformSetting } from '../models';

interface TelegramConfig {
  botToken: string;
  channelId: string;
}

interface SendMessageOptions {
  message: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPreview?: boolean;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
    username?: string;
  };
}

class TelegramService {
  private configCache: TelegramConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get Telegram configuration from database
   */
  async getConfig(): Promise<TelegramConfig> {
    // Check cache
    if (this.configCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.configCache;
    }

    // Load from database
    const [botTokenSetting, channelIdSetting] = await Promise.all([
      PlatformSetting.findOne({ where: { key: 'telegram_bot_token' } }),
      PlatformSetting.findOne({ where: { key: 'telegram_channel_id' } }),
    ]);

    this.configCache = {
      botToken: botTokenSetting?.value || '',
      channelId: channelIdSetting?.value || '',
    };
    this.cacheTimestamp = Date.now();

    return this.configCache;
  }

  /**
   * Update Telegram configuration
   */
  async updateConfig(config: Partial<TelegramConfig>): Promise<void> {
    if (config.botToken !== undefined) {
      await PlatformSetting.upsert({
        key: 'telegram_bot_token',
        value: config.botToken,
        type: 'string',
      });
    }

    if (config.channelId !== undefined) {
      await PlatformSetting.upsert({
        key: 'telegram_channel_id',
        value: config.channelId,
        type: 'string',
      });
    }

    // Clear cache
    this.configCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if Telegram is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config.botToken && config.channelId);
  }

  /**
   * Send a message to the configured Telegram channel
   */
  async sendMessage(options: SendMessageOptions): Promise<{ success: boolean; messageId?: number; error?: string }> {
    const config = await this.getConfig();

    if (!config.botToken || !config.channelId) {
      return {
        success: false,
        error: 'Telegram not configured. Please set bot token and channel ID in settings.',
      };
    }

    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: config.channelId,
          text: options.message,
          parse_mode: options.parseMode || 'HTML',
          disable_web_page_preview: options.disableWebPreview || false,
        }),
      });

      const data = await response.json() as TelegramApiResponse;

      if (!data.ok) {
        console.error('Telegram API error:', data);
        return {
          success: false,
          error: data.description || 'Failed to send message to Telegram',
        };
      }

      return {
        success: true,
        messageId: data.result?.message_id,
      };
    } catch (error: any) {
      console.error('Telegram service error:', error);
      return {
        success: false,
        error: error.message || 'Failed to connect to Telegram',
      };
    }
  }

  /**
   * Send a listing promotion to Telegram channel
   */
  async sendListingPromotion(listing: {
    id: string;
    mcNumber: string;
    title: string;
    listingPrice: number;
    state?: string;
    yearsActive?: number;
    fleetSize?: number;
    safetyRating?: string;
    totalInspections?: number;
  }, customMessage?: string): Promise<{ success: boolean; messageId?: number; error?: string }> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://mc-xchange.vercel.app';
    const listingUrl = `${frontendUrl}/mc/${listing.id}`;

    // Build the message
    let message = '';

    if (customMessage) {
      message = customMessage + '\n\n';
    }

    // Mask MC number - show only last 3 digits
    const maskedMC = listing.mcNumber.length > 3
      ? '***' + listing.mcNumber.slice(-3)
      : '***';

    message += `🚛 <b>${listing.title}</b>\n\n`;
    message += `📋 MC# ${maskedMC}\n`;
    message += `💰 Listing Price: $${listing.listingPrice.toLocaleString()}\n`;

    if (listing.totalInspections !== undefined) {
      message += `🔍 Inspections: ${listing.totalInspections}\n`;
    }
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

    message += `\n🔗 <a href="${listingUrl}">View Listing</a>`;

    return this.sendMessage({ message, parseMode: 'HTML' });
  }

  /**
   * Test the Telegram connection
   */
  async testConnection(): Promise<{ success: boolean; botName?: string; error?: string }> {
    const config = await this.getConfig();

    if (!config.botToken) {
      return {
        success: false,
        error: 'Bot token not configured',
      };
    }

    try {
      const url = `https://api.telegram.org/bot${config.botToken}/getMe`;
      const response = await fetch(url);
      const data = await response.json() as TelegramApiResponse;

      if (!data.ok) {
        return {
          success: false,
          error: data.description || 'Invalid bot token',
        };
      }

      return {
        success: true,
        botName: data.result?.username,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Telegram',
      };
    }
  }
}

export const telegramService = new TelegramService();
export default telegramService;
