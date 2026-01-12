/**
 * Dashboard Shell Component
 * Shared layout for all dashboard experiences with navigation and impersonation banner
 */

import { AlertTriangle, LogOut, Menu, Search, Settings, User, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useDashboardContext } from '../../hooks/useDashboardContext';
import { UserRole } from '../../types';
import { UnifiedSearch } from '../UI/UnifiedSearch';
import { NotificationBell } from './NotificationBell';
import {
  DASHBOARD_NAV,
  type DashboardRole,
  type NavItem,
} from './dashboardNav';

interface DashboardShellProps {
  children: React.ReactNode;
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  onSettingsClick?: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  currentPath = '/',
  onNavigate,
  onLogout,
  onSettingsClick,
}) => {
  const { user, isImpersonating, impersonatedUser, exitImpersonation } =
    useDashboardContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  // Determine role and navigation
  const getRole = (): DashboardRole => {
    const isAdmin =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.MASTER_ADMIN ||
      user.role === UserRole.ADMIN_LEGACY;
    if (isAdmin) return 'admin';
    if (user.role === UserRole.RESELLER) return 'reseller';
    if (user.role === UserRole.CLIENT) return 'client';
    return 'owner';
  };

  const role = getRole();
  const navItems = DASHBOARD_NAV[role] || [];

  const handleNavClick = (item: NavItem) => {
    if (onNavigate) {
      onNavigate(item.href);
    } else {
      window.location.href = item.href;
    }
    setSidebarOpen(false);
  };

  const isActive = (item: NavItem) => {
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <UnifiedSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      
      {/* Impersonation Banner */}
      {isImpersonating && impersonatedUser && (
        <div className="bg-amber-500 text-white px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              Impersonating: {impersonatedUser.name}{' '}
              <span className="hidden sm:inline">
                ({impersonatedUser.email})
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={exitImpersonation}
            className="text-sm font-medium hover:underline flex items-center gap-1 flex-shrink-0 py-1"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2.5 rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Logo/Brand */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.jpg"
                  alt="BuildMyBot"
                  className="h-7 sm:h-8 w-auto rounded-md object-contain shadow-sm"
                />
                <h1 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 hidden sm:block">
                  BuildMyBot
                </h1>
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-4">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors mr-2"
              >
                <Search size={16} />
                <span className="text-sm">Search...</span>
                <kbd className="hidden lg:inline-block text-xs bg-white px-1.5 py-0.5 rounded border border-slate-300">
                  ⌘K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="md:hidden p-2.5 rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Search size={20} />
              </button>

              <NotificationBell />
              <button
                type="button"
                className="p-2.5 rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center hidden sm:flex"
                onClick={() => {
                  if (onSettingsClick) {
                    onSettingsClick();
                  }
                }}
              >
                <Settings size={20} />
              </button>
              <button
                type="button"
                className="p-2.5 rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center hidden sm:flex"
                onClick={() => {
                  if (onLogout) {
                    onLogout();
                  }
                }}
                title="Logout"
              >
                <LogOut size={20} />
              </button>
              <div className="flex items-center gap-2 ml-1">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center">
                    <User size={16} className="text-slate-600" />
                  </div>
                )}
                <span className="hidden md:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
                  {user.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-72 sm:w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out
            md:translate-x-0 md:static md:inset-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            pt-14 sm:pt-16 md:pt-0
          `}
        >
          <nav className="h-full overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
            {/* Mobile-only settings/logout in sidebar */}
            <div className="sm:hidden border-b border-slate-100 pb-4 mb-4">
              <button
                type="button"
                onClick={() => {
                  if (onSettingsClick) onSettingsClick();
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 min-h-[48px]"
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onLogout) onLogout();
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 min-h-[48px]"
              >
                <LogOut size={18} />
                <span>Log Out</span>
              </button>
            </div>
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavClick(item)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[48px] sm:min-h-0
                      ${
                        isActive(item)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                      }
                    `}
                  >
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-h-screen">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
