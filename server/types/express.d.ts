import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: any;
      actor?: any;
      impersonation?: {
        sessionId: string;
        targetUserId: string;
        actorUserId: string;
      };
      organization?: any;
      permissions?: string[];
      session?: any;
    }
  }
}
