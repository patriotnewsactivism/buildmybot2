export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  ADMIN_LEGACY = 'Admin',
  MASTER_ADMIN = 'MasterAdmin',
  RESELLER = 'RESELLER',
  CLIENT = 'CLIENT',
}

export enum PlanType {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  EXECUTIVE = 'EXECUTIVE',
  ENTERPRISE = 'ENTERPRISE',
}

export interface PhoneAgentConfig {
  enabled: boolean;
  phoneNumber?: string;
  voiceId: string;
  introMessage: string;
  cartesiaApiKey?: string;
  delegationLink?: string;
  twilioSid?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: PlanType;
  companyName: string;
  avatarUrl?: string;
  resellerCode?: string;
  resellerClientCount?: number; // For tier calculation
  customDomain?: string; // White-label domain (e.g., app.myagency.com)
  referredBy?: string; // Code of the reseller who referred this user
  phoneConfig?: PhoneAgentConfig;
  status?: 'Active' | 'Suspended' | 'Pending'; // For admin management
  createdAt?: string; // ISO date string
  whitelabelEnabled?: boolean;
  whitelabelEnabledAt?: string;
  whitelabelPaidThrough?: string;
  whitelabelSubscriptionId?: string;
  organizationId?: string;
  lastLoginAt?: string;
  preferences?: Record<string, unknown>;
}

export interface LeadCaptureSettings {
  enabled: boolean;
  promptAfter: number; // Number of messages after which to prompt for contact info (0 = immediately)
  emailRequired: boolean;
  nameRequired: boolean;
  phoneRequired: boolean;
  customPrompt?: string; // Optional custom prompt for collecting info
}

export interface Bot {
  id: string;
  name: string;
  type: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  knowledgeBase: string[]; // Mocking file contents as strings for now
  active: boolean;
  conversationsCount: number;
  themeColor: string;
  websiteUrl?: string; // For the AI website builder
  maxMessages?: number; // Fail-safe for billing (soft limit)
  randomizeIdentity?: boolean; // Human-like behavior
  avatar?: string; // Custom avatar URL/Base64
  responseDelay?: number; // Simulated typing delay in ms
  embedType?: 'hover' | 'fixed'; // Chatbot display type: floating bubble or fixed embed
  userId?: string; // Optional during creation, required in DB
  organizationId?: string;
  leadCapture?: LeadCaptureSettings; // Lead capture configuration
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  score: number;
  status: 'New' | 'Contacted' | 'Qualified' | 'Closed';
  sourceBotId: string;
  createdAt: string;
  userId?: string; // Optional during capture, required in DB
  organizationId?: string;
}

export interface Conversation {
  id: string;
  botId: string;
  messages: { role: 'user' | 'model'; text: string; timestamp: number }[];
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  timestamp: number;
  organizationId?: string;
}

export interface AnalyticsData {
  date: string;
  conversations: number;
  leads: number;
}

export interface ResellerStats {
  totalClients: number;
  totalRevenue: number;
  commissionRate: number;
  pendingPayout: number;
  grossCommission?: number;
  whitelabelFeeDue?: boolean;
  whitelabelFeeAmount?: number;
  whitelabelPaidThrough?: string;
  partnerAccessActive?: boolean;
  partnerAccessAppliesToAll?: boolean;
  partnerAccessStart?: string | null;
  partnerAccessEligibleClients?: number;
  partnerAccessLegacyClients?: number;
}

export interface BotDocument {
  id: string;
  botId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  content?: string;
  createdAt?: string;
}

export interface MarketingMaterial {
  id: string;
  title: string;
  description?: string;
  type: string;
  size?: string;
  downloadUrl: string;
  previewUrl?: string;
  createdAt?: string;
}

export interface PartnerNote {
  id: string;
  partnerId: string;
  clientId?: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerTask {
  id: string;
  partnerId: string;
  clientId?: string;
  title: string;
  status: string;
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerPayout {
  id: string;
  partnerId: string;
  amountCents: number;
  status: string;
  periodStart?: string;
  periodEnd?: string;
  method?: string;
  createdAt?: string;
}

export interface AdminFinancialOverview {
  mrrCents: number;
  arrCents: number;
  churnRate: number;
  activeCustomers: number;
  churnedCustomers: number;
}

export interface SystemSettingsPayload {
  maintenanceMode: boolean;
  envOverrides: Record<string, unknown>;
  apiKeys: Record<string, string>;
}

export interface AdminMetrics {
  activeUsers: number;
  apiCallsPerMin: number;
  dbConnections: number;
  dbIdleConnections: number;
  dbWaitingConnections: number;
  errorRate: number;
  avgLatencyMs: number;
  totalUsers: number;
  mrrCents: number;
}

export interface PartnerClientSummary extends User {
  mrrCents: number;
  botCount: number;
  leadCount: number;
  lastActiveAt: string;
  accessLevel: string;
  canImpersonate: boolean;
}

export interface ClientOverview {
  stats: {
    botCount: number;
    leadCount: number;
    conversionRate: number;
    averageLeadScore: number;
  };
  recentBots: Bot[];
  recentLeads: Lead[];
}
