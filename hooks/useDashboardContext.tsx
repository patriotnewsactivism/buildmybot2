/**
 * Dashboard Context Hook
 * Provides centralized access to organization, role, and impersonation state
 */

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { dbService } from '../services/dbService';
import { type User, UserRole } from '../types';

interface DashboardContextType {
  user: User | null;
  organizationId: string | null;
  isImpersonating: boolean;
  impersonatedUser: User | null;
  exitImpersonation: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined,
);

export const useDashboardContext = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error(
      'useDashboardContext must be used within DashboardProvider',
    );
  }
  return context;
};

interface DashboardProviderProps {
  children: ReactNode;
  initialUser: User | null;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({
  children,
  initialUser,
}) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);

  useEffect(() => {
    if (user) {
      // Load organization ID from user
      setOrganizationId(user.organizationId || null);

      // Check for active impersonation
      dbService
        .getActiveImpersonations()
        .then((sessions) => {
          if (sessions?.length) {
            const session = sessions[0];
            setIsImpersonating(true);
            // Load impersonated user data
            dbService
              .getUser(session.targetUserId)
              .then((targetUser) => {
                if (targetUser) {
                  setImpersonatedUser(targetUser);
                  setOrganizationId(targetUser.organizationId || null);
                }
              })
              .catch(console.error);
          }
        })
        .catch(console.error);
    }
  }, [user]);

  const exitImpersonation = async () => {
    try {
      // Get active impersonation token
      const sessions = await dbService.getActiveImpersonations();
      if (sessions?.length) {
        await dbService.endImpersonation(sessions[0].id);
      }
      setIsImpersonating(false);
      setImpersonatedUser(null);
      if (user) {
        setOrganizationId(user.organizationId || null);
      }
      // Refresh page to reset state
      window.location.reload();
    } catch (error) {
      console.error('Failed to exit impersonation:', error);
    }
  };

  const refreshContext = async () => {
    if (user) {
      try {
        const updatedUser = await dbService.getUser(user.id);
        if (updatedUser) {
          setUser(updatedUser);
          setOrganizationId(updatedUser.organizationId || null);
        }
      } catch (error) {
        console.error('Failed to refresh context:', error);
      }
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        user: impersonatedUser || user,
        organizationId,
        isImpersonating,
        impersonatedUser,
        exitImpersonation,
        refreshContext,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};
