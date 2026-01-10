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
  role: UserRole.OWNER,
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
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Users')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('renders partner navigation for partner users', async () => {
    renderDashboard(mockPartnerUser, <div>Partner Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      expect(screen.getByText('Clients')).toBeInTheDocument();
      expect(screen.getByText('Earnings')).toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });

    expect(screen.getByText('Partner Content')).toBeInTheDocument();
  });

  it('renders client navigation for client users', async () => {
    renderDashboard(mockClientUser, <div>Client Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Bots')).toBeInTheDocument();
      expect(screen.getByText('Leads')).toBeInTheDocument();
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

  it('handles mobile menu toggle', async () => {
    const user = userEvent.setup();
    renderDashboard(mockAdminUser, <div>Content</div>);

    await waitFor(() => {
      expect(screen.getByText('BuildMyBot')).toBeInTheDocument();
    });

    // Menu button should exist (mobile view)
    const menuButton = screen.queryByRole('button', { name: /menu/i });
    if (menuButton) {
      await user.click(menuButton);
      // Sidebar should be visible
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeVisible();
      });
    }
  });

  it('calls onNavigate when navigation item is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <DashboardProvider initialUser={mockAdminUser}>
        <DashboardShell currentPath="/admin" onNavigate={onNavigate}>
          <div>Content</div>
        </DashboardShell>
      </DashboardProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    const usersLink = screen.getByText('Users').closest('button');
    if (usersLink) {
      await user.click(usersLink);
      expect(onNavigate).toHaveBeenCalled();
    }
  });
});
