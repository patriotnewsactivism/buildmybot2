/**
 * API Routes Index
 * Centralized export point for all API routes
 */

import adminRouter from './admin';
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
import revenueRouter from './revenue';
import templatesRouter from './templates';
import webhooksRouter from './webhooks';
import searchRouter from './search';
import teamRouter from './team';

export {
  organizationsRouter,
  auditRouter,
  analyticsRouter,
  adminRouter,
  partnersRouter,
  clientsRouter,
  impersonationRouter,
  templatesRouter,
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
};
