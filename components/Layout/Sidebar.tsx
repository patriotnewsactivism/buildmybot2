import {
  BarChart3,
  Bot,
  Briefcase,
  FileText,
  Globe,
  Headphones,
  Key,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Palette,
  Phone,
  Settings,
  Shield,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { PLANS } from '../../constants';
import { type User, UserRole } from '../../types';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  role: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  user?: User;
  usage?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  role,
  isOpen,
  onClose,
  onLogout,
  user,
  usage = 0,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bots', label: 'My Bots', icon: Bot },
    { id: 'chat-logs', label: 'Conversations', icon: MessageSquare },
    { id: 'leads', label: 'Lead CRM', icon: Users },
    { id: 'phone', label: 'Phone Agent', icon: Phone },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'landing-pages', label: 'Landing Pages', icon: FileText },
    { id: 'marketing', label: 'AI Marketing', icon: Megaphone },
    { id: 'website', label: 'AI Sites', icon: Globe },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'services', label: 'Pro Services', icon: Zap },
    { id: 'billing', label: 'Billing & Usage', icon: Shield },
    { id: 'support', label: 'Support', icon: Headphones },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const isPendingPartner =
    role === UserRole.RESELLER && user?.status === 'Pending';
  const isAdmin =
    role === UserRole.ADMIN ||
    role === UserRole.MASTER_ADMIN ||
    role === UserRole.ADMIN_LEGACY;

  if ((role === UserRole.RESELLER && !isPendingPartner) || isAdmin) {
    menuItems.splice(1, 0, {
      id: 'reseller',
      label: 'Partner/Reseller',
      icon: Briefcase,
    });
  }

  // Admin has a special separate dashboard, but can access it via sidebar if logged in as admin context
  if (isAdmin) {
    menuItems.push({ id: 'admin', label: 'Master Admin', icon: TrendingUp });
  }

  const handleNavigation = (viewId: string) => {
    setView(viewId);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  const planName = user?.plan || 'Free';
  const planLimit = PLANS[user?.plan || 'FREE']?.conversations || 60;
  const usagePercent = Math.min(100, Math.round((usage / planLimit) * 100));

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-slate-900/80 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-[#0f172a] text-slate-400 border-r border-slate-900 z-50 transition-transform duration-300 ease-in-out transform shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
            <img
              src="/logo.jpg"
              alt="BuildMyBot"
              className="h-6 w-auto rounded-md object-contain shadow-lg"
            />
            <span className="text-slate-100">BuildMyBot</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-slate-500 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-3 md:px-4 py-4 space-y-1 overflow-y-auto h-[calc(100vh-200px)] md:h-[calc(100vh-180px)]">
          {menuItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNavigation(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 md:py-3 rounded-lg transition-all duration-200 group min-h-[48px] ${
                currentView === item.id
                  ? 'bg-blue-900 text-white shadow-lg shadow-blue-900/40'
                  : 'hover:bg-slate-800 hover:text-slate-100 active:bg-slate-700'
              }`}
            >
              <item.icon
                size={20}
                className={`flex-shrink-0 ${currentView === item.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}
              />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-slate-900 bg-[#0B1120]">
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Current Plan
            </p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-200 font-bold truncate capitalize">
                {planName.toLowerCase()}
              </span>
              <span className="bg-emerald-900/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-900/50">
                Active
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
              <div
                className={`h-full transition-all duration-500 ${usagePercent > 90 ? 'bg-red-500' : 'bg-blue-600'}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2 flex justify-between">
              <span>
                {usage.toLocaleString()} / {planLimit.toLocaleString()} msgs
              </span>
              {usagePercent > 90 && (
                <button
                  type="button"
                  className="text-red-400 font-bold hover:underline bg-transparent border-0 p-0"
                  onClick={() => setView('billing')}
                >
                  Upgrade
                </button>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 rounded-lg bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 active:bg-red-900/50 transition-all duration-200 border border-red-900/30 min-h-[48px] md:min-h-0"
          >
            <LogOut size={18} />
            <span className="font-medium text-sm">Log Out</span>
          </button>
        </div>
      </div>
    </>
  );
};
