import {
  ArrowRight,
  Bell,
  Bot as BotIcon,
  CheckCircle,
  DollarSign,
  Flame,
  Loader,
  Menu,
  MessageSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import {
  AdminDashboardV2,
  AdminTab,
} from './components/Admin/AdminDashboardV2';
import { AdvancedAnalytics } from './components/Analytics/AdvancedAnalytics';
import { AuthModal } from './components/Auth/AuthModal';
import { PartnerSignup } from './components/Auth/PartnerSignup';
import { Billing } from './components/Billing/Billing';
import { BotBuilder } from './components/BotBuilder/BotBuilder';
import { LeadsCRM } from './components/CRM/LeadsCRM';
import { ChatLogs } from './components/Chat/ChatLogs';
import { FullPageChat } from './components/Chat/FullPageChat';
import { ClientOverview } from './components/Client/ClientOverview';
import { DashboardShell } from './components/Dashboard/DashboardShell';
import { RouteGuard } from './components/Dashboard/RouteGuard';
import { LandingPage } from './components/Landing/LandingPage';
import { PartnerProgramPage } from './components/Landing/PartnerProgramPage';
import { AboutPage } from './components/Landing/pages/AboutPage';
import { ArticlePage } from './components/Landing/pages/ArticlePage';
import { BlogPage } from './components/Landing/pages/BlogPage';
import { CareersPage } from './components/Landing/pages/CareersPage';
import { ContactPage } from './components/Landing/pages/ContactPage';
import { DemoPage } from './components/Landing/pages/DemoPage';
import { FaqPage } from './components/Landing/pages/FaqPage';
import { FeaturesPage } from './components/Landing/pages/FeaturesPage';
import { PricingPage } from './components/Landing/pages/PricingPage';
import { PrivacyPage } from './components/Landing/pages/PrivacyPage';
import { LandingPageBuilder } from './components/LandingPages/LandingPageBuilder';
import { Sidebar } from './components/Layout/Sidebar';
import { MarketingTools } from './components/Marketing/MarketingTools';
import { EnhancedMarketplace } from './components/Marketplace/EnhancedMarketplace';
import { TemplateMarketplace } from './components/Marketplace/TemplateMarketplace';
import {
  PartnerDashboardV2,
  PartnerTab,
} from './components/Partner/PartnerDashboardV2';
import { PhoneAgent } from './components/PhoneAgent/PhoneAgent';
import { ResellerDashboard } from './components/Reseller/ResellerDashboard';
import { ServiceCatalog } from './components/Services/ServiceCatalog';
import { Settings } from './components/Settings/Settings';
import { StatusPage } from './components/Status/StatusPage';
import { SupportTicketSystem } from './components/Support/SupportTicketSystem';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import { WebsiteBuilder } from './components/WebsiteBuilder/WebsiteBuilder';
import { MOCK_ANALYTICS_DATA, PLANS } from './constants';
import { useAuth } from './hooks/useAuth';
// Phase 2: Dashboard Infrastructure
import { DashboardProvider } from './hooks/useDashboardContext';
import { dbService } from './services/dbService';
import {
  type Bot as BotType,
  type Conversation,
  type Lead,
  PlanType,
  type ResellerStats,
  type User,
  UserRole,
} from './types';

const INITIAL_CHAT_LOGS: Conversation[] = [];
const INITIAL_RESELLER_STATS: ResellerStats = {
  totalClients: 0,
  totalRevenue: 0,
  commissionRate: 0.2,
  pendingPayout: 0,
};

// MASTER ADMIN CONFIGURATION - Only MasterAdmin role users should be in this list
const MASTER_ADMINS = ['mreardon@wtpnews.org', 'jadj19@gmail.com'];
const PLATFORM_HOST = 'buildmybot.app';
const PLATFORM_URL = `https://${PLATFORM_HOST}`;

type PartnerSignupData = {
  name: string;
  email: string;
  password: string;
  companyName: string;
};

type MarketplaceTemplate = {
  name: string;
  category?: string | null;
  description?: string | null;
};

function App() {
  const {
    user: authUser,
    isLoading: authLoading,
    isAuthenticated,
    logout,
  } = useAuth();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [showPartnerPage, setShowPartnerPage] = useState(false);
  const [showPartnerSignup, setShowPartnerSignup] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [bots, setBots] = useState<BotType[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [chatLogs, setChatLogs] = useState<Conversation[]>(INITIAL_CHAT_LOGS);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [notification, setNotification] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [impersonation, setImpersonation] = useState<{
    token: string;
    targetUserId: string;
    expiresAt: string;
  } | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isBuildMyBotHost =
    hostname === 'buildmybot.app' || hostname.endsWith('.buildmybot.app');

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  // Dashboard tab state for controlled navigation
  const [adminActiveTab, setAdminActiveTab] = useState<
    | 'metrics'
    | 'users'
    | 'partners'
    | 'financial'
    | 'analytics'
    | 'notifications'
    | 'support'
    | 'system'
  >('metrics');
  const [partnerActiveTab, setPartnerActiveTab] = useState<
    'clients' | 'commissions' | 'marketing' | 'analytics' | 'collaboration'
  >('clients');

  useEffect(() => {
    if (!authLoading && isAuthenticated && authUser) {
      // SECURITY OVERRIDE: Check if email is in master admin list
      const userEmail = authUser.email?.toLowerCase() || '';
      const isMasterAdmin = MASTER_ADMINS.includes(userEmail);

      // Force MasterAdmin Role if in master admin list, otherwise use stored role
      // Roles: MASTER_ADMIN (highest), ADMIN, RESELLER, CLIENT, OWNER
      const effectiveRole = isMasterAdmin
        ? UserRole.MASTER_ADMIN
        : (authUser.role as UserRole) || UserRole.OWNER;

      const mappedUser: User = {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        role: effectiveRole,
        plan: (authUser.plan as PlanType) || PlanType.FREE,
        companyName: authUser.companyName || '',
        avatarUrl: authUser.avatarUrl ?? undefined,
        resellerCode: authUser.resellerCode ?? undefined,
        status:
          (authUser.status as 'Active' | 'Suspended' | 'Pending' | undefined) ??
          undefined,
        createdAt: authUser.createdAt?.toString() || new Date().toISOString(),
        organizationId: authUser.organizationId ?? undefined,
      };

      setUser(mappedUser);
      setIsLoggedIn(true);
      dbService.setAuthContext({ userId: mappedUser.id });

      // Automatically route based on role
      if (
        mappedUser.role === UserRole.MASTER_ADMIN ||
        mappedUser.role === UserRole.ADMIN
      ) {
        setCurrentView('admin');
      } else if (mappedUser.role === UserRole.RESELLER) {
        setCurrentView('reseller');
      } else if (mappedUser.role === UserRole.CLIENT) {
        setCurrentView('client');
      }
    }
  }, [authLoading, isAuthenticated, authUser]);

  useEffect(() => {
    if (!isBuildMyBotHost) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');

    if (authParam === 'login' || authParam === 'signup') {
      setAuthMode(authParam);
      setAuthModalOpen(true);
    }
  }, [isBuildMyBotHost]);

  useEffect(() => {
    if (!user) {
      return;
    }

    dbService
      .getActiveImpersonations()
      .then((sessions) => {
        if (sessions?.length) {
          const session = sessions[0];
          setImpersonation({
            token: session.id,
            targetUserId: session.targetUserId,
            expiresAt: session.expiresAt,
          });
          dbService.setAuthContext({ impersonationToken: session.id });
          return dbService.getUserProfile(session.targetUserId);
        }
        return null;
      })
      .then((target) => {
        if (target) {
          setImpersonatedUser(target);
        }
      })
      .catch((error) => {
        console.error('Failed to load impersonation session:', error);
      });
  }, [user]);

  const handleManualAuth = (
    email: string,
    name?: string,
    companyName?: string,
  ) => {
    // Check master admin list for manual auth as well
    const isMasterAdmin = MASTER_ADMINS.includes(email.toLowerCase());

    const newUser: User = {
      id: `demo-user-${Date.now()}`,
      name: name || email.split('@')[0],
      email: email,
      role: isMasterAdmin ? UserRole.MASTER_ADMIN : UserRole.OWNER,
      plan: PlanType.FREE,
      companyName: companyName || 'Demo Company',
      createdAt: new Date().toISOString(),
    };

    setUser(newUser);
    setIsLoggedIn(true);
    dbService.setAuthContext({ userId: newUser.id });
    setAuthModalOpen(false);

    setNotification(
      isMasterAdmin ? 'Welcome Master Admin' : 'Logged in successfully',
    );

    // Auto-switch view for admin (MasterAdmin or ADMIN roles)
    if (isMasterAdmin) {
      setCurrentView('admin');
    }

    setTimeout(() => setNotification(null), 3000);
  };

  const currentPath = window.location.pathname;
  if (currentPath === '/status') {
    return <StatusPage />;
  }
  if (currentPath.startsWith('/chat/')) {
    const botId = currentPath.split('/')[2];
    return <FullPageChat botId={botId} />;
  }
  if (currentPath === '/about') {
    return <AboutPage />;
  }
  if (currentPath === '/blog') {
    return <BlogPage />;
  }
  if (currentPath.startsWith('/blog/')) {
    const articleId = Number.parseInt(currentPath.split('/')[2] || '1', 10);
    return <ArticlePage articleId={articleId} />;
  }
  if (currentPath === '/careers') {
    return <CareersPage />;
  }
  if (currentPath === '/contact') {
    return <ContactPage />;
  }
  if (currentPath === '/privacy') {
    return <PrivacyPage />;
  }
  if (currentPath === '/features') {
    return <FeaturesPage />;
  }
  if (currentPath === '/pricing') {
    return (
      <>
        <PricingPage onLogin={() => openAuth('login')} />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultMode={authMode}
          onLoginSuccess={handleManualAuth}
        />
      </>
    );
  }
  if (currentPath === '/faq') {
    return (
      <>
        <FaqPage onLogin={() => openAuth('login')} />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultMode={authMode}
          onLoginSuccess={handleManualAuth}
        />
      </>
    );
  }
  if (currentPath === '/demo') {
    return (
      <>
        <DemoPage onLogin={() => openAuth('login')} />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultMode={authMode}
          onLoginSuccess={handleManualAuth}
        />
      </>
    );
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('bmb_ref_code', refCode);
      console.log('Referral captured:', refCode);
    }

    setTimeout(() => setIsBooting(false), 500);
  }, []);

  useEffect(() => {
    const unsubscribeBots = dbService.subscribeToBots((updatedBots) => {
      setBots(updatedBots);
    });

    const unsubscribeLeads = dbService.subscribeToLeads((updatedLeads) => {
      setLeads(updatedLeads);
    });

    return () => {
      unsubscribeBots();
      unsubscribeLeads();
    };
  }, []);

  const totalConversations = bots.reduce(
    (acc, bot) => acc + bot.conversationsCount,
    0,
  );
  const totalLeads = leads.length;
  const estSavings = totalConversations * 5;
  const avgResponseTime = '0.8s';
  const activeUser = impersonatedUser || user;

  const handleAdminLogin = () => {
    openAuth('login');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    setCurrentView('dashboard');
    setBots([]);
    setLeads([]);
    setChatLogs([]);
    setImpersonation(null);
    setImpersonatedUser(null);
    dbService.setAuthContext({
      userId: undefined,
      impersonationToken: undefined,
    });
    setNotification('Logged out successfully');
    setTimeout(() => setNotification(null), 3000);
  };

  const handlePartnerSignup = async (data: PartnerSignupData) => {
    const resellerCode =
      data.companyName.substring(0, 3).toUpperCase() +
      Date.now().toString().slice(-4);
    const newPartner: Omit<User, 'id'> = {
      email: data.email,
      name: data.name,
      role: UserRole.OWNER,
      plan: PlanType.FREE,
      companyName: data.companyName,
      resellerCode: resellerCode,
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
    };

    const savedPartner = await dbService.createUser(newPartner);

    if (savedPartner) {
      setUser(savedPartner);
      setIsLoggedIn(true);
      dbService.setAuthContext({ userId: savedPartner.id });
      setShowPartnerSignup(false);
      setShowPartnerPage(false);
      setCurrentView('dashboard');
      setNotification(
        "Partner application submitted! Your account is pending approval. You'll receive full partner access once approved.",
      );
      setTimeout(() => setNotification(null), 5000);
    } else {
      setNotification(
        'Failed to submit application. The email may already be in use.',
      );
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleInstallTemplate = (template: MarketplaceTemplate) => {
    const category = template.category || 'Custom';
    const description = template.description || 'Provide expert guidance.';
    const newBot: BotType = {
      id: 'new',
      name: template.name,
      type: category === 'All' ? 'Custom' : category,
      systemPrompt: `You are a helpful assistant specialized in ${category}. ${description}. Act professionally and help the user achieve their goals.`,
      model: 'gpt-5o-mini',
      temperature: 0.7,
      knowledgeBase: [],
      active: true,
      conversationsCount: 0,
      themeColor: ['#1e3a8a', '#be123c', '#047857', '#d97706'][
        Math.floor(Math.random() * 4)
      ],
      maxMessages: 20,
      randomizeIdentity: true,
    };

    dbService.saveBot(newBot);

    setNotification(`Installed "${template.name}" successfully!`);
    setTimeout(() => setNotification(null), 3000);
    setCurrentView('bots');
  };

  const handleUpdateLead = (updatedLead: Lead) => {
    dbService.saveLead(updatedLead);
  };

  const handleLeadDetected = (email: string) => {
    const newLead: Lead = {
      id: Date.now().toString(),
      name: 'Website Visitor',
      email: email,
      score: 85,
      status: 'New',
      sourceBotId: 'test-bot',
      createdAt: new Date().toISOString(),
    };
    dbService.saveLead(newLead);
    setNotification('New Hot Lead Detected from Chat! 🔥');
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSaveBot = async (bot: BotType) => {
    try {
      const savedBot = await dbService.saveBot(bot);
      // Update the bots state immediately with the server-generated ID
      setBots((prevBots) => {
        const existingIndex = prevBots.findIndex(
          (b) => b.id === bot.id || b.id === savedBot.id,
        );
        if (existingIndex >= 0) {
          const updated = [...prevBots];
          updated[existingIndex] = savedBot;
          return updated;
        }
        return [...prevBots, savedBot];
      });
      setNotification('Bot saved successfully!');
    } catch (error) {
      setNotification('Failed to save bot. Please try again.');
    }
    setTimeout(() => setNotification(null), 2000);
  };

  const handleStartImpersonation = async (
    targetUserId: string,
    reason: string,
  ) => {
    try {
      const session = await dbService.startImpersonation(targetUserId, reason);
      setImpersonation({
        token: session.token,
        targetUserId,
        expiresAt: session.expiresAt,
      });
      const target = await dbService.getUserProfile(targetUserId);
      setImpersonatedUser(target);
      setCurrentView('dashboard');
    } catch (error) {
      console.error('Failed to start impersonation:', error);
      setNotification('Impersonation failed. Please try again.');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleEndImpersonation = async () => {
    if (!impersonation?.token) {
      return;
    }
    try {
      await dbService.endImpersonation(impersonation.token);
      setImpersonation(null);
      setImpersonatedUser(null);
    } catch (error) {
      console.error('Failed to end impersonation:', error);
      setNotification('Failed to end impersonation.');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  if (isBooting) {
    return (
      <div className="h-screen w-full bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center animate-fade-in">
          <div className="w-20 h-20 bg-blue-900 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-900/50 mb-6 animate-bounce-slow">
            <BotIcon size={48} className="text-white" />
          </div>
          <h1 className="text-white font-bold text-2xl tracking-widest uppercase mb-2">
            BuildMyBot
          </h1>
          <p className="text-blue-400 text-xs font-mono tracking-wide mb-6">
            INITIALIZING SYSTEM...
          </p>
          <div className="flex gap-1.5">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <div
              className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: '0.1s' }}
            />
            <div
              className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: '0.2s' }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn || !user) {
    if (showPartnerSignup) {
      return (
        <PartnerSignup
          onBack={() => setShowPartnerSignup(false)}
          onComplete={handlePartnerSignup}
        />
      );
    }
    if (showPartnerPage) {
      return (
        <PartnerProgramPage
          onBack={() => setShowPartnerPage(false)}
          onLogin={() => openAuth('login')}
          onSignup={() => setShowPartnerSignup(true)}
        />
      );
    }
    return (
      <>
        <LandingPage
          onLogin={() => openAuth('login')}
          onNavigateToPartner={() => setShowPartnerPage(true)}
          onAdminLogin={handleAdminLogin}
        />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultMode={authMode}
          onLoginSuccess={handleManualAuth}
        />
      </>
    );
  }

  // Phase 2: Wrap with DashboardProvider for context
  // Determine if we're using DashboardShell (new layout) or legacy layout
  const usesNewDashboard =
    currentView === 'admin' ||
    currentView === 'reseller' ||
    currentView === 'dashboard' ||
    currentView === 'client';

  return (
    <DashboardProvider initialUser={user}>
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
        {/* Legacy Sidebar - only show for legacy views (bots, leads, etc.) */}
        {!usesNewDashboard && (
          <Sidebar
            currentView={currentView}
            setView={setCurrentView}
            role={user.role}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onLogout={handleLogout}
            user={user}
            usage={totalConversations}
          />
        )}

        <main
          className={`flex-1 overflow-hidden relative flex flex-col h-full ${!usesNewDashboard ? 'md:ml-64' : ''}`}
        >
          {/* Mobile header - only show for legacy views */}
          {!usesNewDashboard && (
            <div className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center border border-blue-800 shadow-lg shadow-blue-900/50 text-white">
                  <BotIcon size={20} />
                </div>
                BuildMyBot
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-slate-600"
              >
                <Menu size={24} />
              </button>
            </div>
          )}

          <div
            className={`flex-1 overflow-y-auto ${!usesNewDashboard ? 'p-4 md:p-8' : ''}`}
          >
            {notification && (
              <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl animate-bounce-slow flex items-center gap-3">
                <Bell size={18} className="text-blue-400" /> {notification}
              </div>
            )}

            {/* Phase 2: Admin Dashboard with DashboardShell */}
            {currentView === 'admin' && (
              <RouteGuard requiredRole="admin">
                <DashboardShell
                  currentPath={`/admin${adminActiveTab === 'metrics' ? '' : `/${adminActiveTab}`}`}
                  onNavigate={(path) => {
                    // Map URL paths to tab state
                    if (path === '/admin') setAdminActiveTab('metrics');
                    else if (path === '/admin/users')
                      setAdminActiveTab('users');
                    else if (path === '/admin/partners')
                      setAdminActiveTab('partners');
                    else if (path === '/admin/financial')
                      setAdminActiveTab('financial');
                    else if (path === '/admin/bots') setCurrentView('bots');
                    else if (path === '/admin/analytics')
                      setAdminActiveTab('analytics');
                    else if (path === '/admin/support')
                      setAdminActiveTab('support');
                    else if (path === '/admin/system')
                      setAdminActiveTab('system');
                    else if (path.startsWith('/app/bots'))
                      setCurrentView('bots');
                    else if (path.startsWith('/app/leads'))
                      setCurrentView('leads');
                  }}
                  onLogout={handleLogout}
                  onSettingsClick={() => setCurrentView('settings')}
                >
                  <AdminDashboardV2
                    onImpersonate={handleStartImpersonation}
                    activeTab={adminActiveTab}
                    onTabChange={setAdminActiveTab}
                  />
                </DashboardShell>
              </RouteGuard>
            )}

            {/* Phase 2: Partner Dashboard with DashboardShell */}
            {currentView === 'reseller' && (
              <RouteGuard requiredRole="reseller">
                <DashboardShell
                  currentPath={`/partner/${partnerActiveTab}`}
                  onNavigate={(path) => {
                    // Map URL paths to tab state
                    if (path === '/partner/clients')
                      setPartnerActiveTab('clients');
                    else if (path === '/partner/commissions')
                      setPartnerActiveTab('commissions');
                    else if (path === '/partner/marketing')
                      setPartnerActiveTab('marketing');
                    else if (path === '/partner/analytics')
                      setPartnerActiveTab('analytics');
                    else if (path === '/partner/collaboration')
                      setPartnerActiveTab('collaboration');
                    else if (path.startsWith('/app/bots'))
                      setCurrentView('bots');
                    else if (path.startsWith('/app/leads'))
                      setCurrentView('leads');
                  }}
                  onLogout={handleLogout}
                  onSettingsClick={() => setCurrentView('settings')}
                >
                  <PartnerDashboardV2
                    user={user}
                    onImpersonate={handleStartImpersonation}
                    activeTab={partnerActiveTab}
                    onTabChange={setPartnerActiveTab}
                  />
                </DashboardShell>
              </RouteGuard>
            )}

            {/* Phase 2: Owner Dashboard with DashboardShell (regular business owners) */}
            {currentView === 'dashboard' && (
              <RouteGuard requiredRole="owner">
                <DashboardShell
                  currentPath="/app"
                  onNavigate={(path) => {
                    // Map paths to currentView
                    if (path === '/app/bots') setCurrentView('bots');
                    else if (path === '/app/leads') setCurrentView('leads');
                    else if (path === '/app') setCurrentView('dashboard');
                  }}
                  onLogout={handleLogout}
                  onSettingsClick={() => setCurrentView('settings')}
                >
                  <ClientOverview
                    user={activeUser}
                    onCreateBot={() => setCurrentView('bots')}
                    onOpenLeads={() => setCurrentView('leads')}
                  />
                </DashboardShell>
              </RouteGuard>
            )}

            {/* Phase 2: Client Dashboard with DashboardShell (CLIENT role - managed by resellers) */}
            {currentView === 'client' && (
              <RouteGuard requiredRole="client">
                <DashboardShell
                  currentPath="/app"
                  onNavigate={(path) => {
                    // Map paths to currentView
                    if (path === '/app/bots') setCurrentView('bots');
                    else if (path === '/app/leads') setCurrentView('leads');
                    else if (path === '/app') setCurrentView('client');
                  }}
                  onLogout={handleLogout}
                  onSettingsClick={() => setCurrentView('settings')}
                >
                  <ClientOverview
                    user={activeUser}
                    onCreateBot={() => setCurrentView('bots')}
                    onOpenLeads={() => setCurrentView('leads')}
                  />
                </DashboardShell>
              </RouteGuard>
            )}

            {/* Legacy views - not using DashboardShell yet */}
            {currentView === 'bots' && (
              <ErrorBoundary>
                <BotBuilder
                  bots={bots}
                  onSave={handleSaveBot}
                  customDomain={activeUser?.customDomain}
                  onLeadDetected={handleLeadDetected}
                />
              </ErrorBoundary>
            )}

            {currentView === 'marketing' && <MarketingTools />}

            {currentView === 'leads' && (
              <LeadsCRM leads={leads} onUpdateLead={handleUpdateLead} />
            )}

            {currentView === 'website' && <WebsiteBuilder />}

            {currentView === 'marketplace' && (
              <ErrorBoundary>
                <TemplateMarketplace
                  onInstall={handleInstallTemplate}
                  userId={activeUser?.id}
                  organizationId={activeUser?.organizationId || ''}
                />
              </ErrorBoundary>
            )}

            {currentView === 'phone' && activeUser && (
              <PhoneAgent
                user={activeUser}
                onUpdate={(updated) => {
                  if (impersonatedUser) {
                    setImpersonatedUser(updated);
                  } else {
                    setUser(updated);
                  }
                  dbService.saveUserProfile(updated);
                }}
              />
            )}

            {currentView === 'chat-logs' && (
              <ChatLogs conversations={chatLogs} />
            )}

            {currentView === 'billing' && <Billing user={user} />}

            {currentView === 'settings' && activeUser && (
              <Settings
                user={activeUser}
                onUpdateUser={(updated) => {
                  if (impersonatedUser) {
                    setImpersonatedUser(updated);
                  } else {
                    setUser(updated);
                  }
                  dbService.saveUserProfile(updated);
                }}
              />
            )}

            {currentView === 'analytics' && (
              <ErrorBoundary>
                <AdvancedAnalytics
                  organizationId={activeUser?.organizationId || ''}
                />
              </ErrorBoundary>
            )}

            {currentView === 'landing-pages' && (
              <LandingPageBuilder
                bots={bots}
                organizationId={activeUser?.organizationId}
              />
            )}

            {currentView === 'services' && (
              <ServiceCatalog
                organizationId={activeUser?.organizationId || ''}
                userId={activeUser?.id}
              />
            )}

            {currentView === 'support' && (
              <SupportTicketSystem user={activeUser || undefined} />
            )}
          </div>
        </main>
      </div>
    </DashboardProvider>
  );
}

export default App;
