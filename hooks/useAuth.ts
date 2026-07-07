import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl, safeParseJson } from '../services/apiConfig';
import { dbService } from '../services/dbService';

/**
 * Shape of the row returned by GET /api/auth/user (the Vercel serverless
 * function returns the Supabase `users` row minus password_hash). This is
 * intentionally NOT the Drizzle type from shared/schema — that schema
 * belongs to the legacy Express server and is missing most of these fields.
 */
export interface AuthUser {
  id: string;
  email: string;
  role?: string | null;
  name?: string | null;
  plan?: string | null;
  companyName?: string | null;
  avatarUrl?: string | null;
  resellerCode?: string | null;
  status?: string | null;
  createdAt?: string | null;
  organizationId?: string | null;
  [key: string]: unknown;
}

async function fetchUser(): Promise<AuthUser | null> {
  const response = await fetch(buildApiUrl('/auth/user'), {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return safeParseJson<AuthUser>(response);
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUser()
      .then((fetchedUser) => {
        setUser(fetchedUser);
        if (fetchedUser?.id) {
          dbService.setAuthContext({ userId: fetchedUser.id });
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      dbService.setAuthContext({ userId: undefined });
      await fetch(buildApiUrl('/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.warn('Logout failed:', error);
    }
    window.location.href = '/';
  }, []);

  const login = useCallback(() => {
    window.location.href = '/?auth=login';
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    login,
  };
}
