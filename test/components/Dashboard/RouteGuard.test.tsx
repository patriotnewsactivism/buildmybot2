/**
 * Route Guard Component Tests
 * Tests for Phase 2 route protection
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteGuard } from '../../../components/Dashboard/RouteGuard';
import { DashboardProvider } from '../../../hooks/useDashboardContext';
import { type User, UserRole } from '../../../types';

// Mock dbService
vi.mock('../../../services/dbService', () => ({
  dbService: {
    getActiveImpersonations: vi.fn().mockResolvedValue([]),
    getUser: vi.fn(),
    endImpersonation: vi.fn().mockResolvedValue(true),
  },
}));

const mockAdminUser: User = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@test.com',
  role: UserRole.ADMIN,
  organizationId: 'org-1',
  createdAt: new Date().toISOString(),
};

const mockClientUser: User = {
  id: 'client-1',
  name: 'Client User',
  email: 'client@test.com',
  role: UserRole.OWNER,
  organizationId: 'org-1',
  createdAt: new Date().toISOString(),
};

describe('RouteGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows admin users to access admin routes', async () => {
    render(
      <DashboardProvider initialUser={mockAdminUser}>
        <RouteGuard requiredRole="admin">
          <div>Admin Content</div>
        </RouteGuard>
      </DashboardProvider>,
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(
      screen.queryByText(/authentication required/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it('blocks non-admin users from admin routes', async () => {
    render(
      <DashboardProvider initialUser={mockClientUser}>
        <RouteGuard requiredRole="admin">
          <div>Admin Content</div>
        </RouteGuard>
      </DashboardProvider>,
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });

  it('blocks unauthenticated users', () => {
    render(
      <DashboardProvider initialUser={null}>
        <RouteGuard requiredRole="admin">
          <div>Admin Content</div>
        </RouteGuard>
      </DashboardProvider>,
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
  });

  it('blocks users without organization', async () => {
    const userWithoutOrg = { ...mockClientUser, organizationId: null };

    render(
      <DashboardProvider initialUser={userWithoutOrg}>
        <RouteGuard requiredRole="owner" requireOrganization={true}>
          <div>Client Content</div>
        </RouteGuard>
      </DashboardProvider>,
    );

    expect(screen.queryByText('Client Content')).not.toBeInTheDocument();
    expect(screen.getByText(/organization required/i)).toBeInTheDocument();
  });

  it('allows access when requireOrganization is false', async () => {
    const userWithoutOrg = { ...mockClientUser, organizationId: null };

    render(
      <DashboardProvider initialUser={userWithoutOrg}>
        <RouteGuard requiredRole="owner" requireOrganization={false}>
          <div>Client Content</div>
        </RouteGuard>
      </DashboardProvider>,
    );

    expect(screen.getByText('Client Content')).toBeInTheDocument();
  });
});
