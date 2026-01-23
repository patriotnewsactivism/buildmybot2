/**
 * Dashboard Shell Component Tests
 * Tests for Phase 2 dashboard infrastructure
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../../components/Dashboard/DashboardShell';
import { DashboardProvider } from '../../../hooks/useDashboardContext';
import { type User, UserRole } from '../../../types';

// Mock dbService
vi.mock('../../../services/dbService', () => ({
  dbService: {
    getActiveImpersonations: vi.fn().mockResolvedValue([]),
    getUser: vi.fn(),
    endImpersonation: vi.fn().mockResolvedValue(true),
    getNotifications: vi.fn().mockResolvedValue({ unread: [], recent: [], unreadCount: 0 }),
    markNotificationViewed: vi.fn(),
    markAllNotificationsViewed: vi.fn(),
    acknowledgeNotification: vi.fn(),
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

const mockPartnerUser: User = {
  id: 'partner-1',
  name: 'Partner User',
  email: 'partner@test.com',
  role: UserRole.RESELLER,
  organizationId: 'org-1',
  createdAt: new Date().toISOString(),
};

const mockClientUser: User = {
  id: 'client-1',
  name: 'Client User',
  email: 'client@test.com',
  role: UserRole.CLIENT,
  organizationId: 'org-1',
  createdAt: new Date().toISOString(),
};

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDashboard = (user: User, children: React.ReactNode) => {
    return render(
      <DashboardProvider initialUser={user}>
        <DashboardShell currentPath="/admin" onNavigate={vi.fn()}>
          {children}
        </DashboardShell>
      </DashboardProvider>,
    );
  };

  it('renders admin navigation for admin users', async () => {
    renderDashboard(mockAdminUser, <div>Admin Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      // Overview is common
      expect(screen.getAllByText('Overview')[0]).toBeInTheDocument();
      // Users is admin only
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('renders partner navigation for partner users', async () => {
    renderDashboard(mockPartnerUser, <div>Partner Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      expect(screen.getByText('Clients')).toBeInTheDocument();
    });

    expect(screen.getByText('Partner Content')).toBeInTheDocument();
  });

  it('renders client navigation for client users', async () => {
    renderDashboard(mockClientUser, <div>Client Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      expect(screen.getByText('My Bots')).toBeInTheDocument();
    });

    expect(screen.getByText('Client Content')).toBeInTheDocument();
  });

  it('displays impersonation banner when impersonating', async () => {
    const { dbService } = await import('../../../services/dbService');
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

    renderDashboard(mockAdminUser, <div>Content</div>);

    await waitFor(() => {
      expect(screen.getByText(/impersonating/i)).toBeInTheDocument();
      const impersonatedElements = screen.getAllByText(/Impersonated User/i);
      expect(impersonatedElements.length).toBeGreaterThan(0);
    });
  });
});
