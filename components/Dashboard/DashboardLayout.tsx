/**
 * DashboardLayout — the single shell for every authenticated role.
 *
 * Replaces the two competing layouts (Layout/Sidebar.tsx + Dashboard/
 * DashboardShell.tsx). Renders a grouped, role-aware sidebar built from
 * navConfig, a top bar (search / notifications / settings / logout), the
 * impersonation banner, and an <Outlet /> for the active route.
 */

import {
  AlertTriangle,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  User as UserIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDashboardContext } from '../../hooks/useDashboardContext';
import { UnifiedSearch } from '../UI/UnifiedSearch';
import { NotificationBell } from './NotificationBell';
import { NAV, ROLE_HOME, getNavRole } from './navConfig';

interface DashboardLayoutProps {
  onLogout?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  onLogout,
}) => {
  const { user, isImpersonating, impersonatedUser, exitImpersonation } =
    useDashboardContext();
  const navigate = useNavigate();
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
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  const navRole = getNavRole(user.role);
  const groups = NAV[navRole];
  const settingsPath = `${ROLE_HOME[navRole]}/settings`;

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  const closeMobile = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <UnifiedSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Impersonation banner */}
      {isImpersonating && impersonatedUser && (
        <div className="flex flex-col items-start justify-between gap-2 bg-amber-500 px-4 py-2 text-white sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span className="truncate text-sm font-medium">
              Impersonating: {impersonatedUser.name}{' '}
              <span className="hidden sm:inline">
                ({impersonatedUser.email})
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={exitImpersonation}
            className="flex-shrink-0 py-1 text-sm font-medium hover:underline"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-[#0f172a] transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center justify-between px-5 sm:h-16">
            <button
              type="button"
              onClick={() => navigate(ROLE_HOME[navRole])}
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <UserIcon size={0} className="hidden" />
                <span className="text-sm font-black">B</span>
              </span>
              BuildMyBot
            </button>
            <button
              type="button"
              onClick={closeMobile}
              className="text-slate-400 hover:text-white md:hidden"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {groups.map((group, gi) => (
              <div key={group.heading ?? `group-${gi}`}>
                {group.heading && (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {group.heading}
                  </p>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={closeMobile}
                      className={linkClasses}
                    >
                      <item.icon size={18} className="flex-shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-800 p-3">
            <div className="mb-2 flex items-center gap-2 px-2">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700">
                  <UserIcon size={16} className="text-slate-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onLogout?.()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/40 bg-red-900/20 px-3 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-200"
            >
              <LogOut size={16} />
              Log Out
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closeMobile}
          />
        )}

        {/* Main column */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
            <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
              >
                <Menu size={22} />
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-slate-500 hover:bg-slate-200 sm:max-w-xs"
              >
                <Search size={16} />
                <span className="text-sm">Search…</span>
                <kbd className="ml-auto hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs lg:inline-block">
                  ⌘K
                </kbd>
              </button>

              <div className="flex items-center gap-1">
                <NotificationBell />
                <button
                  type="button"
                  onClick={() => navigate(settingsPath)}
                  title="Settings"
                  className="flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                >
                  <SettingsIcon size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onLogout?.()}
                  title="Log out"
                  className="hidden h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 sm:flex"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
