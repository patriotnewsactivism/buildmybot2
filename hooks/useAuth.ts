import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl, safeParseJson } from '../services/apiConfig';
import { dbService } from '../services/dbService';
import type { User } from '../shared/schema';

async function fetchUser(): Promise<User | null> {
  const response = await fetch(buildApiUrl('/auth/user'), {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return safeParseJson<User>(response);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
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
