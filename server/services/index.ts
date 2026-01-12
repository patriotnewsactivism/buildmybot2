// Service Layer Exports
// Centralized export point for all service classes

export { AuditService } from './AuditService';
export { BotService } from './BotService';
export { LeadService } from './LeadService';
export { OrganizationService } from './OrganizationService';
export { UserService } from './UserService';
export { AnalyticsService } from './AnalyticsService';
export { ChannelService } from './ChannelService';
export { WebScraperService } from './WebScraperService';
export { DocumentProcessorService } from './DocumentProcessorService';
export { KnowledgeService } from './KnowledgeService';
export { WebhookService, webhookService } from './WebhookService';

// Export types from AnalyticsService
export type {
  ConversionMetrics,
  BotPerformance,
  TimeSeriesData,
  Insight,
  PeakHours,
  SentimentBreakdown,
} from './AnalyticsService';

// Export types from ChannelService
export type {
  ChannelType,
  ChannelConfig,
  Deployment,
  ChannelStatus,
} from './ChannelService';
