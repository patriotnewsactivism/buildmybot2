/**
 * API Routes Index
 * Centralized export point for all API routes
 */

import adminRouter from './admin';
import agencyRouter from './agency';
import analyticsRouter from './analytics';
import auditRouter from './audit';
import { authRouter } from './auth';
import channelsRouter from './channels';
import chatRouter from './chat';
import clientsRouter from './clients';
import healthRouter from './health';
import impersonationRouter from './impersonation';
import integrationsRouter from './integrations';
import knowledgeRouter from './knowledge';
import landingPagesRouter from './landingPages';
import leadsRouter from './leads';
import notificationsRouter from './notifications';
import organizationsRouter from './organizations';
import partnersRouter from './partners';
import { phoneRouter } from './phone';
import salesAgentsRouter from './salesAgents';
import revenueRouter from './revenue';
import searchRouter from './search';
import teamRouter from './team';
import templatesRouter from './templates';
import toolsRouter from './tools';
import { twilioWebhooksRouter } from './twilioWebhooks';
import voiceAgentsRouter from './voiceAgents';
import voiceRouter from './voice';
import webhooksRouter from './webhooks';

export {
  organizationsRouter,
  auditRouter,
  analyticsRouter,
  adminRouter,
  agencyRouter,
  partnersRouter,
  clientsRouter,
  impersonationRouter,
  templatesRouter,
  toolsRouter,
  webhooksRouter,
  channelsRouter,
  searchRouter,
  teamRouter,
  knowledgeRouter,
  revenueRouter,
  chatRouter,
  leadsRouter,
  landingPagesRouter,
  notificationsRouter,
  authRouter,
  healthRouter,
  integrationsRouter,
  phoneRouter,
  twilioWebhooksRouter,
  salesAgentsRouter,
  voiceAgentsRouter,
  voiceRouter,
};
