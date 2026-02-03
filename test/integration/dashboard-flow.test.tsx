/**
 * Dashboard Flow Integration Tests
 * End-to-end tests for Phase 2 dashboard system
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../components/Dashboard/DashboardShell';
import { RouteGuard } from '../../components/Dashboard/RouteGuard';
import { DashboardProvider } from '../../hooks/useDashboardContext';
import { type User, UserRole } from '../../types';

// Mock dbService
vi.mock('../../services/dbService', () => ({
  dbService: {
    getActiveImpersonations: vi.fn().mockResolvedValue([]),
    getUser: vi.fn(),
    endImpersonation: vi.fn().mockResolvedValue(true),
    getNotifications: vi
      .fn()
      .mockResolvedValue({ unread: [], recent: [], unreadCount: 0 }),
    markNotificationViewed: vi.fn(),
    markAllNotificationsViewed: vi.fn(),
    acknowledgeNotification: vi.fn(),
  },
}));

describe('Dashboard Flow Integration', () => {
  const mockAdminUser: User = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@test.com',
    role: UserRole.ADMIN,
    organizationId: 'org-1',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes full admin dashboard flow', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <DashboardProvider initialUser={mockAdminUser}>
        <DashboardShell currentPath="/admin" onNavigate={onNavigate}>
          <RouteGuard requiredRole="admin">
            <div>Admin Dashboard Content</div>
          </RouteGuard>
        </DashboardShell>
      </DashboardProvider>,
    );

    // Verify initial render
    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      expect(screen.getByText('Admin Dashboard Content')).toBeInTheDocument();
    });

    // Verify navigation items
    // Use getAllByText for 'Overview' as it might appear multiple times (mobile/desktop or breadcrumbs)
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();

    // Test navigation
    const usersLink = screen.getByText('Users').closest('button');
    if (usersLink) {
      await user.click(usersLink);
      expect(onNavigate).toHaveBeenCalled();
    }
  });

  it('blocks unauthorized access', async () => {
    const mockClientUser: User = {
      id: 'client-1',
      name: 'Client User',
      email: 'client@test.com',
      role: UserRole.OWNER,
      organizationId: 'org-1',
      createdAt: new Date().toISOString(),
    };

    render(
      <DashboardProvider initialUser={mockClientUser}>
        <DashboardShell currentPath="/admin" onNavigate={vi.fn()}>
          <RouteGuard requiredRole="admin">
            <div>Admin Content</div>
          </RouteGuard>
        </DashboardShell>
      </DashboardProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });

  it('handles impersonation flow', async () => {
    const { dbService } = await import('../../services/dbService');
    const user = userEvent.setup();

    const mockImpersonatedUser: User = {
      id: 'impersonated-1',
      name: 'Impersonated User',
      email: 'impersonated@test.com',
      role: UserRole.OWNER,
      organizationId: 'org-2',
      createdAt: new Date().toISOString(),
    };

    vi.mocked(dbService.getActiveImpersonations).mockResolvedValue([
      {
        id: 'session-1',
        actorUserId: 'admin-1',
        targetUserId: 'impersonated-1',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    ]);

    vi.mocked(dbService.getUser).mockResolvedValue(mockImpersonatedUser);

    render(
      <DashboardProvider initialUser={mockAdminUser}>
        <DashboardShell currentPath="/admin" onNavigate={vi.fn()}>
          <RouteGuard requiredRole="admin">
            <div>Admin Content</div>
          </RouteGuard>
        </DashboardShell>
      </DashboardProvider>,
    );

    // Verify impersonation banner
    await waitFor(() => {
      expect(screen.getByText(/impersonating/i)).toBeInTheDocument();
      const userElements = screen.getAllByText(/Impersonated User/i);
      expect(userElements.length).toBeGreaterThan(0);
    });

    // Test exit impersonation
    const exitButton = screen.getByText(/exit impersonation/i);
    await user.click(exitButton);

    await waitFor(() => {
      expect(dbService.endImpersonation).toHaveBeenCalled();
    });
  });
});
