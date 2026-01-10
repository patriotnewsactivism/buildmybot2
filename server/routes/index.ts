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
import impersonationRouter from './impersonation';
import knowledgeRouter from './knowledge';
import landingPagesRouter from './landingPages';
import leadsRouter from './leads';
import notificationsRouter from './notifications';
import organizationsRouter from './organizations';
import partnersRouter from './partners';
import revenueRouter from './revenue';
import templatesRouter from './templates';

export {
  organizationsRouter,
  auditRouter,
  analyticsRouter,
  adminRouter,
  partnersRouter,
  clientsRouter,
  impersonationRouter,
  templatesRouter,
  channelsRouter,
  knowledgeRouter,
  revenueRouter,
  chatRouter,
  leadsRouter,
  landingPagesRouter,
  notificationsRouter,
  authRouter,
};
