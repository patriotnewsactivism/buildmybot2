/**
 * API Routes Index
 * Centralized export point for all API routes
 */

import adminRouter from './admin';
import agencyRouter from './agency';
import analyticsRouter from './analytics';
import auditRouter from './audit';
import { authRouter } from './auth';
import botsRouter from './bots'; // Import the new bots router
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
import revenueRouter from './revenue';
import salesAgentsRouter from './salesAgents';
import searchRouter from './search';
import teamRouter from './team';
import templatesRouter from './templates';
import toolsRouter from './tools';
import twilioWebhooksRouter from './twilioWebhooks';
import voiceRouter from './voice';
import voiceAgentsRouter from './voiceAgents';
import webhooksRouter from './webhooks';
import aiEmployeesRouter from './aiEmployees';

export { 
  adminRouter, 
  agencyRouter, 
  analyticsRouter, 
  auditRouter, 
  authRouter, 
  botsRouter, // Export the new bots router
  channelsRouter, 
  chatRouter, 
  clientsRouter, 
  healthRouter, 
  impersonationRouter, 
  integrationsRouter, 
  knowledgeRouter, 
  landingPagesRouter, 
  leadsRouter, 
  notificationsRouter, 
  organizationsRouter, 
  partnersRouter, 
  phoneRouter, 
  revenueRouter, 
  salesAgentsRouter, 
  searchRouter, 
  teamRouter, 
  templatesRouter, 
  toolsRouter, 
  twilioWebhooksRouter, 
  voiceRouter, 
  voiceAgentsRouter, 
  webhooksRouter, 
  aiEmployeesRouter 
};