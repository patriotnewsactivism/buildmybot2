/**
 * Route Guard Component
 * Protects routes based on role and organization membership
 */

import type React from 'react';
import { useDashboardContext } from '../../hooks/useDashboardContext';
import { UserRole } from '../../types';

interface RouteGuardProps {
  role: 'admin' | 'partner' | 'reseller' | 'client' | 'owner';
  children: React.ReactNode;
  requireOrganization?: boolean;
}

export const RouteGuard: React.FC<RouteGuardProps> = ({
  role,
  children,
  requireOrganization = false,
}) => {
  const { user, organizationId } = useDashboardContext();

  // Check authentication
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Authentication Required
          </h2>
          <p className="text-slate-600">Please log in to access this page.</p>
        </div>
      </div>
    );
  }

  // Check organization membership (exempt MASTER_ADMIN users)
  if (
    requireOrganization &&
    !organizationId &&
    user.role !== UserRole.MASTER_ADMIN
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Organization Required
          </h2>
          <p className="text-slate-600">
            Please complete your organization setup.
          </p>
        </div>
      </div>
    );
  }

  // Check role authorization
  const roleMap: Record<
    'admin' | 'partner' | 'reseller' | 'client' | 'owner',
    UserRole[]
  > = {
    admin: [UserRole.ADMIN, UserRole.MASTER_ADMIN, UserRole.ADMIN_LEGACY],
    partner: [UserRole.RESELLER],
    reseller: [UserRole.RESELLER],
    client: [UserRole.CLIENT],
    owner: [UserRole.OWNER, UserRole.CLIENT],
  };

  const allowedRoles = roleMap[role];
  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600">
            You don't have permission to access this page. Required role: {role}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
