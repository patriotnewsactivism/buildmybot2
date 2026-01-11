import {
  type NextFunction,
  type Request,
  RequestHandler,
  type Response,
} from 'express';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

declare global {
  namespace Express {
    interface Request {
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

// ========================================
// VALIDATION SCHEMAS
// ========================================

export const BotSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().max(100),
  systemPrompt: z.string().max(10000),
  model: z.string().max(100),
  temperature: z.number().min(0).max(2),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  maxMessages: z.number().int().min(1).max(10000),
  embedType: z.enum(['hover', 'fixed']),
});

export const LeadSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(['New', 'Contacted', 'Qualified', 'Closed']),
});

export const UserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  companyName: z.string().max(255).optional(),
});

export const OrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});

export const BotTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  systemPrompt: z.string().max(10000),
  configuration: z.record(z.string(), z.unknown()).optional(),
  isPublic: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  priceCents: z.number().int().min(0).default(0),
});

export const AnalyticsEventSchema = z.object({
  eventType: z.string().min(1).max(50),
  eventData: z.record(z.string(), z.unknown()).optional(),
  botId: z.string().optional(),
  sessionId: z.string().optional(),
});

export const MemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  permissions: z.array(z.string()).default([]),
});

export const PartnerClientSchema = z.object({
  clientId: z.string().min(1),
  accessLevel: z.enum(['view', 'manage', 'full']).default('view'),
  commissionRate: z.number().min(0).max(1).default(0),
  canImpersonate: z.boolean().default(false),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const DateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ========================================
// VALIDATION MIDDLEWARE
// ========================================

export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues,
        });
      }
      next(error);
    }
  };
}

export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      req.validated = req.validated || {};
      req.validated.query = parsed;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          error: 'Query validation failed',
          code: 'VALIDATION_ERROR',
          details: validationError.message,
        });
      }
      next(error);
    }
  };
}

export function validateParams<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.params);
      req.validated = req.validated || {};
      req.validated.params = parsed;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          error: 'Invalid parameters',
          code: 'VALIDATION_ERROR',
          details: validationError.message,
        });
      }
      next(error);
    }
  };
}

export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.validated = req.validated || {};
      req.validated.body = parsed;
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validationError.message,
        });
      }
      next(error);
    }
  };
}

export const KnowledgeSchemas = {
  scrape: z.object({
    url: z.string().url('Invalid URL format'),
    crawlDepth: z.coerce.number().int().min(1).max(10).default(1),
  }),
  installPrebuilt: z.object({
    knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  }),
  search: z.object({
    q: z.string().min(1, 'Search query is required').max(500),
  }),
};

export const AuthSchemas = {
  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
  register: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required').max(200),
    companyName: z.string().max(200).optional(),
    referredBy: z.string().optional(),
  }),
};

export const ChatSchemas = {
  message: z.object({
    message: z.string().min(1, 'Message is required').max(10000),
    botId: z.string().min(1, 'Bot ID is required'),
    conversationId: z.string().optional(),
  }),
};
