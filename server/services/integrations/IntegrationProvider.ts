export interface IntegrationProvider {
  id: string;
  name: string;
  validateCredentials(config: any): Promise<boolean>;
  createLead(lead: any, config: any): Promise<void>;
}
