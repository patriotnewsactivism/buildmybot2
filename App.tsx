import { Bell, Bot as BotIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  AdminDashboardV2,
  type AdminTab,
} from './components/Admin/AdminDashboardV2';
import { ErrorRecoveryDashboard } from './components/Admin/ErrorRecoveryDashboard';
import { FinancialDashboard } from './components/Admin/widgets/FinancialDashboard';
import { PartnerOversight } from './components/Admin/widgets/PartnerOversight';
import { UserManagement } from './components/Admin/widgets/UserManagement';
import { AffiliateDashboard } from './components/Affiliate/AffiliateDashboard';
import { AgentDashboard } from './components/Agent/AgentDashboard';
import { AdvancedAnalytics } from './components/Analytics/AdvancedAnalytics';
import { ComprehensiveAnalytics } from './components/Analytics/ComprehensiveAnalytics';
import { AuthModal } from './components/Auth/AuthModal';
import { PartnerSignup } from './components/Auth/PartnerSignup';
import { Billing } from './components/Billing/Billing';
import BotBuilder from './components/BotBuilder/BotBuilder';
import { LeadsCRM } from './components/CRM/LeadsCRM';
import { ChatLogs } from './components/Chat/ChatLogs';
import { FullPageChat } from './components/Chat/FullPageChat';
import { ClientOverview } from './components/Client/ClientOverview';
import { DashboardLayout } from './components/Dashboard/DashboardLayout';
import { ROLE_HOME, getNavRole } from './components/Dashboard/navConfig';
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
import { MarketingTools } from './components/Marketing/MarketingTools';
import { TemplateMarketplace } from './components/Marketplace/TemplateMarketplace';
import {
  PartnerDashboardV2,
  type PartnerTab,
} from './components/Partner/PartnerDashboardV2';
import { PhoneAgent } from './components/PhoneAgent/PhoneAgent';
import { ServiceCatalog } from './components/Services/ServiceCatalog';
import { Settings } from './components/Settings/Settings';
import { StatusPage } from './components/Status/StatusPage';
import { HelpCenter } from './components/Support/HelpCenter';
import { SupportTicketSystem } from './components/Support/SupportTicketSystem';
import { AITeamDashboard } from './components/Team/AITeamDashboard';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import { WebsiteBuilder } from './components/WebsiteBuilder/WebsiteBuilder';
import { useAuth } from './hooks/useAuth';
import { DashboardProvider } from './hooks/useDashboardContext';
import { dbService } from './services/dbService';
import {
  type Bot as BotType,
  type Conversation,
  type Lead,
  PlanType,
  type User,
  UserRole,
} from './types';

const INITIAL_CHAT_LOGS: Conversation[] = [];

// MASTER ADMIN CONFIGURATION - Only MasterAdmin role users should be in this list
const MASTER_ADMINS = [
  'mreardon@wtpnews.org',
  'jadj19@gmail.com',
  'patriotnewsactivism@gmail.com',
];

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

const PARTNER_TABS: PartnerTab[] = [
  'clients',
  'agents',
  'conversations',
  'commissions',
  'marketing',
  'analytics',
  'collaboration',
];

/** Renders the partner dashboard with its active tab driven by the URL. */
const PartnerDashboardRoute: React.FC<{
  user: User;
  onImpersonate: (userId: string, reason: string) => void;
}> = ({ user, onImpersonate }) => {
  const navigate = useNavigate();
  const { tab } = useParams();
  const activeTab: PartnerTab = PARTNER_TABS.includes(tab as PartnerTab)
    ? (tab as PartnerTab)
    : 'clients';
  return (
    <div className="p-3 sm:p-6">
      <PartnerDashboardV2
        user={user}
        onImpersonate={onImpersonate}
        activeTab={activeTab}
        onTabChange={(t) => navigate(`/partner/${t}`)}
      />
    </div>
  );
};

function App() {
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();

  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [justAuthenticated, setJustAuthenticated] = useState(false);
  const [isBooting, setIsBooting] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [bots, setBots] = useState<BotType[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [chatLogs, setChatLogs] = useState<Conversation[]>(INITIAL_CHAT_LOGS);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [notification, setNotification] = useState<string | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);

  const hostname =
    typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isBuildMyBotHost =
    hostname === 'buildmybot.app' || hostname.endsWith('.buildmybot.app');

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleHomepageLoginClick = () => {
    if (isLoggedIn && user) {
      navigate(ROLE_HOME[getNavRole(user.role)]);
    } else {
      openAuth('login');
    }
  };

  // ── Map the authenticated session onto our User model ──
  useEffect(() => {
    if (!authLoading && isAuthenticated && authUser) {
      const userEmail = authUser.email?.toLowerCase() || '';
      const isMasterAdmin = MASTER_ADMINS.includes(userEmail);
      const effectiveRole = isMasterAdmin
        ? UserRole.MASTER_ADMIN
        : (authUser.role as UserRole) || UserRole.OWNER;

      const mappedUser: User = {
        id: authUser.id,
        name: authUser.name || authUser.email,
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
    }
  }, [authLoading, isAuthenticated, authUser]);

  // ── After an explicit login/signup, land on the role's home ──
  useEffect(() => {
    if (justAuthenticated && user) {
      navigate(ROLE_HOME[getNavRole(user.role)]);
      setJustAuthenticated(false);
    }
  }, [justAuthenticated, user, navigate]);

  // ── Deep-link auth modal (?auth=login|signup) on the marketing host ──
  useEffect(() => {
    if (!isBuildMyBotHost) return;
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');
    if (authParam === 'login' || authParam === 'signup') {
      setAuthMode(authParam);
      setAuthModalOpen(true);
    }
  }, [isBuildMyBotHost]);

  // ── Restore any active impersonation session ──
  useEffect(() => {
    if (!user) return;
    dbService
      .getActiveImpersonations()
      .then((sessions) => {
        if (sessions?.length) {
          const session = sessions[0];
          dbService.setAuthContext({ impersonationToken: session.id });
          return dbService.getUserProfile(session.targetUserId);
        }
        return null;
      })
      .then((target) => {
        if (target) setImpersonatedUser(target);
      })
      .catch((error) => {
        console.error('Failed to load impersonation session:', error);
      });
  }, [user]);

  // ── Capture referral code + finish boot ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) localStorage.setItem('bmb_ref_code', refCode);
    const t = setTimeout(() => setIsBooting(false), 500);
    return () => clearTimeout(t);
  }, []);

  const handleManualAuth = (
    email: string,
    name?: string,
    companyName?: string,
  ) => {
    const isMasterAdmin = MASTER_ADMINS.includes(email.toLowerCase());
    const newUser: User = {
      id: `demo-user-${Date.now()}`,
      name: name || email.split('@')[0],
      email,
      role: isMasterAdmin ? UserRole.MASTER_ADMIN : UserRole.OWNER,
      plan: PlanType.FREE,
      companyName: companyName || 'Demo Company',
      createdAt: new Date().toISOString(),
    };

    setUser(newUser);
    setIsLoggedIn(true);
    setJustAuthenticated(true);
    dbService.setAuthContext({ userId: newUser.id });
    setAuthModalOpen(false);
    setNotification(
      isMasterAdmin ? 'Welcome Master Admin' : 'Logged in successfully',
    );
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
      resellerCode,
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
    };

    const savedPartner = await dbService.createUser(newPartner);
    if (savedPartner) {
      setUser(savedPartner);
      setIsLoggedIn(true);
      dbService.setAuthContext({ userId: savedPartner.id });
      navigate('/app');
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

  const refreshBots = useCallback(async () => {
    if (!user?.id) return;
    try {
      setBots(await dbService.getBots());
    } catch (error) {
      console.error('Failed to refresh bots:', error);
    }
  }, [user?.id]);

  const refreshLeads = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLeads(await dbService.getLeads());
    } catch (error) {
      console.error('Failed to refresh leads:', error);
    }
  }, [user?.id]);

  const refreshConversations = useCallback(async () => {
    if (!user?.id) return;
    try {
      setChatLogs(await dbService.getConversations(user.id));
    } catch (error) {
      console.error('Failed to refresh conversations:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      refreshBots();
      refreshLeads();
      refreshConversations();
    }
  }, [user?.id, refreshBots, refreshLeads, refreshConversations]);

  const activeUser = impersonatedUser || user;

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    setBots([]);
    setLeads([]);
    setChatLogs([]);
    setImpersonatedUser(null);
    dbService.setAuthContext({
      userId: undefined,
      impersonationToken: undefined,
    });
    setNotification('Logged out successfully');
    setTimeout(() => setNotification(null), 3000);
    navigate('/');
  };

  const handleInstallTemplate = (template: MarketplaceTemplate) => {
    const category = template.category || 'Custom';
    const description = template.description || 'Provide expert guidance.';
    const newBot: BotType = {
      id: 'new',
      name: template.name,
      type: category === 'All' ? 'Custom' : category,
      systemPrompt: `You are a helpful assistant specialized in ${category}. ${description}. Act professionally and help the user achieve their goals.`,
      model: 'grok-4-1-fast-reasoning',
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
    navigate('/app/bots');
  };

  const handleUpdateLead = (updatedLead: Lead) => {
    dbService.saveLead(updatedLead);
  };

  const handleLeadDetected = (email: string) => {
    const newLead: Lead = {
      id: Date.now().toString(),
      name: 'Website Visitor',
      email,
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
      setTimeout(() => setNotification(null), 2000);
      return savedBot;
    } catch (error) {
      setNotification('Failed to save bot. Please try again.');
      setTimeout(() => setNotification(null), 2000);
      throw error;
    }
  };

  const handleStartImpersonation = async (
    targetUserId: string,
    reason: string,
  ) => {
    try {
      const session = await dbService.startImpersonation(targetUserId, reason);
      dbService.setAuthContext({ impersonationToken: session.token });
      const target = await dbService.getUserProfile(targetUserId);
      setImpersonatedUser(target);
      navigate('/app');
    } catch (error) {
      console.error('Failed to start impersonation:', error);
      setNotification('Impersonation failed. Please try again.');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleUpdateActiveUser = (updated: User) => {
    if (impersonatedUser) {
      setImpersonatedUser(updated);
    } else {
      setUser(updated);
    }
    dbService.saveUserProfile(updated);
  };

  // ── Boot splash ──
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

  const loggedIn = isLoggedIn && !!user;
  const navRole = user ? getNavRole(user.role) : 'client';

  const authModal = (
    <AuthModal
      isOpen={authModalOpen}
      onClose={() => setAuthModalOpen(false)}
      defaultMode={authMode}
      onLoginSuccess={handleManualAuth}
    />
  );

  return (
    <DashboardProvider initialUser={user}>
      {notification && (
        <div className="fixed top-6 right-6 z-[100] bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3">
          <Bell size={18} className="text-blue-400" /> {notification}
        </div>
      )}
      {authModal}

      <Routes>
        {/* ── Public marketing / utility ── */}
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={handleHomepageLoginClick}
              onNavigateToPartner={() => navigate('/partner-program')}
              onAdminLogin={() => openAuth('login')}
              isAuthenticated={loggedIn}
            />
          }
        />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/chat/:botId" element={<ChatRoute />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:articleId" element={<ArticleRoute />} />
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route
          path="/pricing"
          element={<PricingPage onLogin={() => openAuth('login')} />}
        />
        <Route
          path="/faq"
          element={<FaqPage onLogin={() => openAuth('login')} />}
        />
        <Route path="/help" element={<HelpCenter />} />
        <Route
          path="/demo"
          element={<DemoPage onLogin={() => openAuth('login')} />}
        />
        <Route
          path="/partner-program"
          element={
            <PartnerProgramPage
              onBack={() => navigate('/')}
              onLogin={() => openAuth('login')}
              onSignup={() => navigate('/partner-program/apply')}
            />
          }
        />
        <Route
          path="/partner-program/apply"
          element={
            <PartnerSignup
              onBack={() => navigate('/partner-program')}
              onComplete={handlePartnerSignup}
            />
          }
        />

        {/* ── Authenticated dashboard ── */}
        {loggedIn ? (
          <Route element={<DashboardLayout onLogout={handleLogout} />}>
            {navRole === 'client' && (
              <>
                <Route
                  path="/app"
                  element={
                    <ClientOverview
                      user={activeUser}
                      onCreateBot={() => navigate('/app/bots')}
                      onOpenLeads={() => navigate('/app/leads')}
                    />
                  }
                />
                <Route
                  path="/app/bots"
                  element={
                    <ErrorBoundary>
                      <BotBuilder
                        bots={bots}
                        onSave={handleSaveBot}
                        customDomain={activeUser?.customDomain}
                        onLeadDetected={handleLeadDetected}
                        onRefresh={refreshBots}
                      />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/app/conversations"
                  element={<ChatLogs conversations={chatLogs} />}
                />
                <Route
                  path="/app/leads"
                  element={
                    <LeadsCRM leads={leads} onUpdateLead={handleUpdateLead} />
                  }
                />
                <Route
                  path="/app/phone"
                  element={
                    activeUser ? (
                      <PhoneAgent
                        user={activeUser}
                        onUpdate={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/app/analytics"
                  element={
                    <ErrorBoundary>
                      <AdvancedAnalytics
                        organizationId={activeUser?.organizationId || ''}
                        endpoint="/clients/analytics/dashboard"
                      />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/app/landing-pages"
                  element={
                    <LandingPageBuilder
                      bots={bots}
                      organizationId={activeUser?.organizationId}
                    />
                  }
                />
                <Route path="/app/marketing" element={<MarketingTools />} />
                <Route path="/app/website" element={<WebsiteBuilder />} />
                <Route
                  path="/app/marketplace"
                  element={
                    <ErrorBoundary>
                      <TemplateMarketplace
                        onInstall={handleInstallTemplate}
                        userId={activeUser?.id}
                        organizationId={activeUser?.organizationId || ''}
                      />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/app/services"
                  element={
                    <ServiceCatalog
                      organizationId={activeUser?.organizationId || ''}
                      userId={activeUser?.id}
                    />
                  }
                />
                <Route
                  path="/app/ai-team"
                  element={<AITeamDashboard user={user} />}
                />
                <Route path="/app/billing" element={<Billing user={user} />} />
                <Route
                  path="/app/support"
                  element={
                    <SupportTicketSystem user={activeUser || undefined} />
                  }
                />
                <Route
                  path="/app/settings"
                  element={
                    activeUser ? (
                      <Settings
                        user={activeUser}
                        onUpdateUser={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route path="/app/*" element={<Navigate to="/app" replace />} />
              </>
            )}

            {navRole === 'admin' && (
              <>
                <Route
                  path="/admin"
                  element={
                    <AdminDashboardV2
                      activeTab={'overview' as AdminTab}
                      onImpersonate={handleStartImpersonation}
                    />
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <div className="p-3 sm:p-6">
                      <ComprehensiveAnalytics
                        organizationId={user?.organizationId}
                      />
                    </div>
                  }
                />
                <Route
                  path="/admin/financial"
                  element={
                    <div className="p-3 sm:p-6">
                      <FinancialDashboard />
                    </div>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <div className="p-3 sm:p-6">
                      <UserManagement
                        onImpersonate={handleStartImpersonation}
                      />
                    </div>
                  }
                />
                <Route
                  path="/admin/partners"
                  element={
                    <div className="p-3 sm:p-6">
                      <PartnerOversight />
                    </div>
                  }
                />
                <Route
                  path="/admin/agents"
                  element={
                    <div className="p-3 sm:p-6">
                      <UserManagement
                        onImpersonate={handleStartImpersonation}
                        initialRole={UserRole.SALES_AGENT}
                      />
                    </div>
                  }
                />
                <Route
                  path="/admin/clients"
                  element={
                    <div className="p-3 sm:p-6">
                      <UserManagement
                        onImpersonate={handleStartImpersonation}
                        initialRole={UserRole.CLIENT}
                      />
                    </div>
                  }
                />
                <Route
                  path="/admin/affiliates"
                  element={
                    <div className="p-3 sm:p-6">
                      <UserManagement
                        onImpersonate={handleStartImpersonation}
                        initialRole={UserRole.AFFILIATE}
                      />
                    </div>
                  }
                />
                <Route
                  path="/admin/bots"
                  element={
                    <ErrorBoundary>
                      <BotBuilder
                        bots={bots}
                        onSave={handleSaveBot}
                        customDomain={activeUser?.customDomain}
                        onLeadDetected={handleLeadDetected}
                        onRefresh={refreshBots}
                      />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/admin/conversations"
                  element={<ChatLogs conversations={chatLogs} />}
                />
                <Route
                  path="/admin/ai-team"
                  element={<AITeamDashboard user={user} />}
                />
                <Route
                  path="/admin/support"
                  element={
                    <SupportTicketSystem user={activeUser || undefined} />
                  }
                />
                <Route
                  path="/admin/system"
                  element={
                    <div className="p-3 sm:p-6">
                      <ErrorRecoveryDashboard />
                    </div>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    activeUser ? (
                      <Settings
                        user={activeUser}
                        onUpdateUser={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/admin/*"
                  element={<Navigate to="/admin" replace />}
                />
              </>
            )}

            {navRole === 'partner' && user && (
              <>
                <Route
                  path="/partner"
                  element={
                    <PartnerDashboardRoute
                      user={user}
                      onImpersonate={handleStartImpersonation}
                    />
                  }
                />
                <Route
                  path="/partner/settings"
                  element={
                    activeUser ? (
                      <Settings
                        user={activeUser}
                        onUpdateUser={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/partner/:tab"
                  element={
                    <PartnerDashboardRoute
                      user={user}
                      onImpersonate={handleStartImpersonation}
                    />
                  }
                />
                <Route
                  path="/partner/*"
                  element={<Navigate to="/partner" replace />}
                />
              </>
            )}

            {navRole === 'agent' && (
              <>
                <Route
                  path="/agent"
                  element={
                    <div className="p-3 sm:p-6">
                      <AgentDashboard />
                    </div>
                  }
                />
                <Route
                  path="/agent/settings"
                  element={
                    activeUser ? (
                      <Settings
                        user={activeUser}
                        onUpdateUser={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/agent/*"
                  element={<Navigate to="/agent" replace />}
                />
              </>
            )}

            {navRole === 'affiliate' && (
              <>
                <Route
                  path="/affiliate"
                  element={
                    <div className="p-3 sm:p-6">
                      <AffiliateDashboard />
                    </div>
                  }
                />
                <Route
                  path="/affiliate/settings"
                  element={
                    activeUser ? (
                      <Settings
                        user={activeUser}
                        onUpdateUser={handleUpdateActiveUser}
                      />
                    ) : null
                  }
                />
                <Route
                  path="/affiliate/*"
                  element={<Navigate to="/affiliate" replace />}
                />
              </>
            )}

            {/* Any other authenticated path → the user's home */}
            <Route
              path="*"
              element={<Navigate to={ROLE_HOME[navRole]} replace />}
            />
          </Route>
        ) : (
          // Not (yet) logged in. Public routes above still match first; only
          // unmatched paths (e.g. a hard-refreshed /admin deep link) land here.
          // While the session is still resolving, show a loader instead of
          // bouncing a logged-in user to the homepage prematurely.
          <Route
            path="*"
            element={
              authLoading ? (
                <div className="flex min-h-screen items-center justify-center text-slate-400">
                  Loading…
                </div>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        )}
      </Routes>
    </DashboardProvider>
  );
}

/** Full-page public chat widget (anonymous visitors). */
const ChatRoute: React.FC = () => {
  const { botId } = useParams();
  return <FullPageChat botId={botId || ''} />;
};

/** Blog article by numeric id. */
const ArticleRoute: React.FC = () => {
  const { articleId } = useParams();
  return <ArticlePage articleId={Number.parseInt(articleId || '1', 10)} />;
};

export default App;
