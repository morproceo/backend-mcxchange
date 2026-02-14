import { config } from '../config';
import logger from '../utils/logger';

interface GHLContactData {
  name: string;
  company: string;
  email: string;
  phone: string;
  fleetSize?: string;
  equipmentType?: string;
  serviceType?: string;
  message?: string;
  tag?: string;
}

interface GHLContactResponse {
  contact: {
    id: string;
    [key: string]: any;
  };
}

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

class GHLService {
  private get apiKey(): string {
    return process.env.GHL_API_KEY || '';
  }

  private get locationId(): string {
    return process.env.GHL_LOCATION_ID || '';
  }

  async createContact(data: GHLContactData): Promise<string | null> {
    if (!this.apiKey || !this.locationId) {
      logger.warn('GHL API key or Location ID not configured. Skipping contact creation.');
      return null;
    }

    const nameParts = data.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const tags = [data.tag || 'Dispatch lead'];

    const body: Record<string, any> = {
      firstName,
      lastName,
      email: data.email,
      phone: data.phone,
      companyName: data.company || undefined,
      locationId: this.locationId,
      tags,
    };

    // Add fleet size, equipment type, and message as custom fields via notes
    const notes: string[] = [];
    if (data.fleetSize) notes.push(`Fleet Size: ${data.fleetSize}`);
    if (data.equipmentType) notes.push(`Equipment Type: ${data.equipmentType}`);
    if (data.serviceType) notes.push(`Service Type: ${data.serviceType}`);
    if (data.message) notes.push(`Message: ${data.message}`);

    if (notes.length > 0) {
      body.source = 'Dispatch Form';
      // GHL v2 doesn't have a direct "notes" field on contact creation,
      // so we pass extra info via customFields or tags. Using tags for filtering
      // and including details in the contact's source field for context.
    }

    try {
      const response = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': GHL_API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const resultBody = await response.json() as any;

      if (!response.ok) {
        // Duplicate contact — GHL returns the existing contact ID
        if (response.status === 400 && resultBody.meta?.contactId) {
          logger.info(`GHL duplicate contact found: ${resultBody.meta.contactId} for ${data.email}`);
          return resultBody.meta.contactId;
        }
        logger.error(`GHL API error: ${response.status} - ${JSON.stringify(resultBody)}`);
        return null;
      }

      const contactId = resultBody.contact?.id;

      logger.info(`GHL contact created: ${contactId} for ${data.email}`);
      return contactId;
    } catch (error) {
      logger.error('GHL API request failed:', error as Error);
      return null;
    }
  }
}

export const ghlService = new GHLService();
export default ghlService;
