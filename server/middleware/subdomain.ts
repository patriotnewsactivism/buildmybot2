import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { organizations } from '../../shared/schema';
import { db } from '../db';

interface SubdomainRequest extends Request {
  tenant?: typeof organizations.$inferSelect;
}

export function subdomainResolution() {
  return async (req: SubdomainRequest, res: Response, next: NextFunction) => {
    try {
      const host = req.get('host') || '';
      const parts = host.split('.');

      // Localhost: localhost:3000 -> no subdomain
      // Dev: tenant.localhost:3000 -> tenant
      // Prod: tenant.buildmybot.app -> tenant

      let subdomain = '';

      // Simplified logic for prototype:
      // If 3+ parts and not starting with 'www' or 'api', treat first part as subdomain
      if (parts.length >= 3) {
        if (parts[0] !== 'www' && parts[0] !== 'api' && parts[0] !== 'status') {
          subdomain = parts[0];
        }
      } else if (host.includes('localhost') && parts.length > 1) {
        // Handle localhost subdomains (e.g. tenant.localhost)
        // But localhost usually doesn't have dots unless configured in hosts file
        // This logic is fragile for localhost without explicit setup, but fine for now
        if (parts[0] !== 'localhost') {
          subdomain = parts[0];
        }
      }

      if (subdomain) {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.slug, subdomain));

        if (org) {
          req.tenant = org;
          // Optionally, you might want to scope future queries here
        }
      }

      next();
    } catch (error) {
      console.error('Subdomain resolution error:', error);
      next();
    }
  };
}
