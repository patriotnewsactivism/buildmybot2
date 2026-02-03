import type { IntegrationProvider } from './IntegrationProvider';

export class HubSpotProvider implements IntegrationProvider {
  id = 'hubspot';
  name = 'HubSpot';

  async validateCredentials(config: any): Promise<boolean> {
    // In a real implementation, you would make a test API call here
    // e.g., GET https://api.hubapi.com/crm/v3/properties/contacts
    return !!config.accessToken;
  }

  async createLead(lead: any, config: any): Promise<void> {
    console.log(
      `[HubSpot Integration] Syncing lead ${lead.email} to HubSpot...`,
    );

    // Simulation of API call
    if (!config.accessToken) {
      throw new Error('Missing HubSpot Access Token');
    }

    // In a real implementation:
    // await axios.post('https://api.hubapi.com/crm/v3/objects/contacts', { ... })

    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate latency
    console.log(`[HubSpot Integration] Successfully synced lead ${lead.email}`);
  }
}
