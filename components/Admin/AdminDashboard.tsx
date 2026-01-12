import {
  Activity,
  AlertTriangle,
  Bot,
  Briefcase,
  Building2,
  CheckCircle,
  Copy,
  DollarSign,
  Edit,
  ExternalLink,
  Gift,
  Globe,
  Headphones,
  Key,
  Loader,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PLANS, RESELLER_TIERS, VOICE_AGENT_PRICING } from '../../constants';
import { dbService } from '../../services/dbService';
import { PlanType, type User, UserRole } from '../../types';

type TabType =
  | 'overview'
  | 'voice'
  | 'invites'
  | 'discounts'
  | 'freecodes'
  | 'plans'
  | 'users'
  | 'bots'
  | 'orgs'
  | 'features';

interface DiscountCode {
  id: string;
  code: string;
  type: string;
  value: number;
  description?: string;
  maxUses?: number;
  currentUses?: number;
  isActive: boolean;
  validUntil?: string;
}

interface FreeCode {
  id: string;
  code: string;
  plan: string;
  durationDays: number;
  description?: string;
  maxUses?: number;
  currentUses?: number;
  isActive: boolean;
  validUntil?: string;
}

interface RevenuePoint {
  month: string;
  amount: number;
}

interface AdminBotSummary {
  id: string;
  name: string;
  type: string;
  userId?: string | null;
  active: boolean;
}

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
}

interface FeatureFlagSetting {
  key: string;
  enabled: boolean;
}

interface PlanSummary {
  name: string;
  price: number;
  features: string[];
}

interface PlansData {
  plans?: Record<string, PlanSummary>;
}

export const AdminDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'RESELLER'>('ADMIN');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState(false);

  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [freeCodes, setFreeCodes] = useState<FreeCode[]>([]);
  const [adminBots, setAdminBots] = useState<AdminBotSummary[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagSetting[]>([]);
  const [plansData, setPlansData] = useState<PlansData | null>(null);

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showFreeCodeModal, setShowFreeCodeModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(
    null,
  );
  const [editingFreeCode, setEditingFreeCode] = useState<FreeCode | null>(null);

  const [discountForm, setDiscountForm] = useState({
    code: '',
    type: 'percentage',
    value: 10,
    description: '',
    maxUses: 100,
    validUntil: '',
  });
  const [freeCodeForm, setFreeCodeForm] = useState({
    code: '',
    plan: 'STARTER',
    durationDays: 30,
    description: '',
    maxUses: 1,
    validUntil: '',
  });
  const [batchForm, setBatchForm] = useState({
    plan: 'STARTER',
    durationDays: 30,
    count: 10,
    prefix: '',
  });

  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [stats, setStats] = useState({
    totalMRR: 0,
    totalUsers: 0,
    activeBots: 0,
    partnerCount: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const allUsers = await dbService.getAllUsers();
        const mrr = allUsers.reduce(
          (acc, u) => acc + (PLANS[u.plan]?.price || 0),
          0,
        );
        const partnerList = allUsers.filter(
          (u) => u.role === UserRole.RESELLER,
        );

        setUsers(allUsers);
        setPartners(partnerList);
        setStats({
          totalMRR: mrr,
          totalUsers: allUsers.length,
          activeBots: 0,
          partnerCount: partnerList.length,
        });

        setRevenueData([
          { month: 'Jan', amount: mrr * 0.4 },
          { month: 'Feb', amount: mrr * 0.55 },
          { month: 'Mar', amount: mrr * 0.7 },
          { month: 'Apr', amount: mrr * 0.85 },
          { month: 'May', amount: mrr * 0.92 },
          { month: 'Jun', amount: mrr },
        ]);
      } catch (e) {
        console.error('Admin Load Error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'discounts') loadDiscountCodes();
    if (activeTab === 'freecodes') loadFreeCodes();
    if (activeTab === 'plans') loadPlans();
    if (activeTab === 'bots') loadBots();
    if (activeTab === 'orgs') loadOrganizations();
    if (activeTab === 'features') loadFeatureFlags();
  }, [activeTab]);

  const loadDiscountCodes = async () => {
    try {
      const codes = await dbService.getAdminDiscountCodes();
      setDiscountCodes(codes);
    } catch (e) {
      console.error(e);
    }
  };

  const loadFreeCodes = async () => {
    try {
      const codes = await dbService.getAdminFreeCodes();
      setFreeCodes(codes);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPlans = async () => {
    try {
      const data = await dbService.getAdminPlans();
      setPlansData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadBots = async () => {
    try {
      const bots = await dbService.getAdminBots();
      setAdminBots(bots);
    } catch (e) {
      console.error(e);
    }
  };

  const loadOrganizations = async () => {
    try {
      const orgs = await dbService.getAdminOrganizations();
      setOrganizations(orgs);
    } catch (e) {
      console.error(e);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const settings = await dbService.getSystemSettings();
      setFeatureFlags(settings.featureFlags || []);
    } catch (e) {
      console.error(e);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleApprovePartner = async (id: string) => {
    await dbService.approvePartner(id);
    setPartners((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'Active' } : p)),
    );
  };

  const handleToggleBusinessStatus = async (
    id: string,
    currentStatus: string,
  ) => {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    await dbService.updateUserStatus(id, newStatus);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: newStatus } : u)),
    );
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) return;
    setInviteError(false);
    const inviteData: Omit<User, 'id'> = {
      email: inviteEmail,
      name: inviteEmail.split('@')[0],
      role: inviteRole === 'ADMIN' ? UserRole.ADMIN : UserRole.RESELLER,
      plan: PlanType.FREE,
      companyName:
        inviteRole === 'ADMIN' ? 'BuildMyBot Admin' : 'Partner Pending',
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
      resellerCode:
        inviteRole === 'RESELLER'
          ? inviteEmail.substring(0, 3).toUpperCase() +
            Date.now().toString().slice(-4)
          : undefined,
    };
    const result = await dbService.createUser(inviteData);
    if (result) {
      setInviteSent(true);
      setInviteEmail('');
      setTimeout(() => setInviteSent(false), 3000);
      if (inviteRole === 'RESELLER')
        setPartners((prev) => [...prev, result]);
    } else {
      setInviteError(true);
      setTimeout(() => setInviteError(false), 4000);
    }
  };

  const handleCreateDiscount = async () => {
    try {
      if (editingDiscount) {
        await dbService.updateDiscountCode(editingDiscount.id, discountForm);
      } else {
        await dbService.createDiscountCode(discountForm);
      }
      loadDiscountCodes();
      setShowDiscountModal(false);
      setEditingDiscount(null);
      setDiscountForm({
        code: '',
        type: 'percentage',
        value: 10,
        description: '',
        maxUses: 100,
        validUntil: '',
      });
      showNotification(
        editingDiscount ? 'Discount updated!' : 'Discount created!',
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteDiscount = async (id: string) => {
    if (!confirm('Delete this discount code?')) return;
    await dbService.deleteDiscountCode(id);
    loadDiscountCodes();
    showNotification('Discount deleted');
  };

  const handleCreateFreeCode = async () => {
    try {
      if (editingFreeCode) {
        await dbService.updateFreeCode(editingFreeCode.id, freeCodeForm);
      } else {
        await dbService.createFreeCode(freeCodeForm);
      }
      loadFreeCodes();
      setShowFreeCodeModal(false);
      setEditingFreeCode(null);
      setFreeCodeForm({
        code: '',
        plan: 'STARTER',
        durationDays: 30,
        description: '',
        maxUses: 1,
        validUntil: '',
      });
      showNotification(
        editingFreeCode ? 'Free code updated!' : 'Free code created!',
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteFreeCode = async (id: string) => {
    if (!confirm('Delete this free code?')) return;
    await dbService.deleteFreeCode(id);
    loadFreeCodes();
    showNotification('Free code deleted');
  };

  const handleGenerateBatch = async () => {
    try {
      await dbService.generateFreeCodeBatch(batchForm);
      loadFreeCodes();
      setShowBatchModal(false);
      setBatchForm({
        plan: 'STARTER',
        durationDays: 30,
        count: 10,
        prefix: '',
      });
      showNotification(`${batchForm.count} codes generated!`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncStripe = async () => {
    setSyncing(true);
    try {
      await dbService.syncPlansToStripe();
      showNotification('Plans synced to Stripe!');
    } catch (e) {
      console.error(e);
      showNotification('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleFeature = async (key: string, enabled: boolean) => {
    try {
      await dbService.updateFeatureFlag({ key, enabled });
      loadFeatureFlags();
      showNotification(`Feature ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Delete this bot?')) return;
    await dbService.deleteAdminBot(id);
    loadBots();
    showNotification('Bot deleted');
  };

  const handleDeleteOrg = async (id: string) => {
    if (!confirm('Delete this organization?')) return;
    await dbService.deleteOrganization(id);
    loadOrganizations();
    showNotification('Organization deleted');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="animate-spin text-blue-900" size={32} />
      </div>
    );
  }

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Server size={16} /> },
    { key: 'users', label: 'Users', icon: <Users size={16} /> },
    { key: 'bots', label: 'Bots', icon: <Bot size={16} /> },
    { key: 'orgs', label: 'Organizations', icon: <Building2 size={16} /> },
    { key: 'plans', label: 'Plans', icon: <DollarSign size={16} /> },
    { key: 'discounts', label: 'Discounts', icon: <Tag size={16} /> },
    { key: 'freecodes', label: 'Free Codes', icon: <Gift size={16} /> },
    { key: 'features', label: 'Features', icon: <Settings size={16} /> },
    { key: 'voice', label: 'Voice', icon: <Phone size={16} /> },
    { key: 'invites', label: 'Invites', icon: <UserPlus size={16} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {notification && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <CheckCircle size={18} /> {notification}
        </div>
      )}

      <div className="bg-slate-900 text-white p-6 -mx-4 -mt-4 md:-mx-8 md:-mt-8 md:rounded-b-2xl mb-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Globe className="text-blue-400" /> Master Admin Console
              </h2>
              <p className="text-slate-400 text-sm">
                Full platform control and configuration
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm transition ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="text-emerald-500" size={24} />
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  ${stats.totalMRR.toLocaleString()}
                </p>
                <p className="text-sm text-slate-500">Monthly Revenue</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="text-blue-500" size={24} />
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.totalUsers}
                </p>
                <p className="text-sm text-slate-500">Total Users</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <Bot className="text-purple-500" size={24} />
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {adminBots.length || stats.activeBots}
                </p>
                <p className="text-sm text-slate-500">Active Bots</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <Briefcase className="text-orange-500" size={24} />
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.partnerCount}
                </p>
                <p className="text-sm text-slate-500">Partners</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueData}>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(v: number) => `$${v.toLocaleString()}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#1e3a8a"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">
                All Users ({users.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.slice(0, 50).map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800">{user.email}</td>
                      <td className="px-4 py-3 text-slate-600">{user.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          {user.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {user.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleBusinessStatus(
                              user.id,
                              user.status || 'Active',
                            )
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {user.status === 'Active' ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'bots' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">
                All Bots ({adminBots.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">User ID</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminBots.map((bot) => (
                    <tr key={bot.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {bot.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{bot.type}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                        {bot.userId?.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${bot.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {bot.active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteBot(bot.id)}
                          className="text-xs text-red-600 hover:underline flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'orgs' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">
                Organizations ({organizations.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {org.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {org.slug}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          {org.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
                          {org.subscriptionStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteOrg(org.id)}
                          className="text-xs text-red-600 hover:underline flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">
                Subscription Plans
              </h3>
              <button
                type="button"
                onClick={handleSyncStripe}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950 font-medium text-sm disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={syncing ? 'animate-spin' : ''}
                />{' '}
                Sync to Stripe
              </button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plansData?.plans &&
                Object.entries(plansData.plans).map(([key, plan]) => (
                    <div
                      key={key}
                      className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"
                    >
                      <h4 className="font-bold text-slate-800 text-lg">
                        {plan.name}
                      </h4>
                      <p className="text-2xl font-bold text-blue-900 my-2">
                        ${plan.price}
                        <span className="text-sm text-slate-500">/mo</span>
                      </p>
                      <ul className="text-sm text-slate-600 space-y-1">
                        {plan.features
                          .slice(0, 4)
                          .map((f: string) => (
                            <li key={f} className="flex items-center gap-1">
                              <CheckCircle
                                size={12}
                                className="text-emerald-500"
                              />{' '}
                              {f}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ),
                )}
            </div>
          </div>
        )}

        {activeTab === 'discounts' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">
                Discount Codes ({discountCodes.length})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingDiscount(null);
                  setDiscountForm({
                    code: '',
                    type: 'percentage',
                    value: 10,
                    description: '',
                    maxUses: 100,
                    validUntil: '',
                  });
                  setShowDiscountModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950 font-medium text-sm"
              >
                <Plus size={16} /> Create Discount
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Uses</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {discountCodes.map((code) => (
                    <tr key={code.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {code.code}
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">
                        {code.type}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {code.type === 'percentage'
                          ? `${code.value}%`
                          : `$${code.value}`}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {code.currentUses || 0}/{code.maxUses || '∞'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${code.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {code.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDiscount(code);
                            setDiscountForm({
                              code: code.code,
                              type: code.type,
                              value: code.value,
                              description: code.description || '',
                              maxUses: code.maxUses || 0,
                              validUntil: code.validUntil || '',
                            });
                            setShowDiscountModal(true);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(code.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {discountCodes.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        No discount codes yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'freecodes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-800 text-lg">
                Free Access Codes ({freeCodes.length})
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm"
                >
                  <Gift size={16} /> Generate Batch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingFreeCode(null);
                    setFreeCodeForm({
                      code: '',
                      plan: 'STARTER',
                      durationDays: 30,
                      description: '',
                      maxUses: 1,
                      validUntil: '',
                    });
                    setShowFreeCodeModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950 font-medium text-sm"
                >
                  <Plus size={16} /> Create Code
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Uses</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {freeCodes.map((code) => (
                    <tr key={code.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {code.code}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          {code.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {code.durationDays} days
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {code.currentUses || 0}/{code.maxUses || 1}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${code.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {code.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigator.clipboard.writeText(code.code)
                          }
                          className="text-xs text-slate-600 hover:underline"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFreeCode(code);
                            setFreeCodeForm({
                              code: code.code,
                              plan: code.plan,
                              durationDays: code.durationDays,
                              description: code.description || '',
                              maxUses: code.maxUses || 1,
                              validUntil: code.validUntil || '',
                            });
                            setShowFreeCodeModal(true);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFreeCode(code.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {freeCodes.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        No free codes yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Feature Flags</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  key: 'voice_agents',
                  label: 'Voice Agents',
                  description: 'Enable AI voice calling feature',
                },
                {
                  key: 'website_builder',
                  label: 'Website Builder',
                  description: 'Landing page builder access',
                },
                {
                  key: 'advanced_analytics',
                  label: 'Advanced Analytics',
                  description: 'Detailed reporting dashboards',
                },
                {
                  key: 'api_access',
                  label: 'API Access',
                  description: 'External API integration',
                },
                {
                  key: 'whitelabel',
                  label: 'White Label',
                  description: 'Custom branding options',
                },
                {
                  key: 'marketplace',
                  label: 'Template Marketplace',
                  description: 'Buy/sell bot templates',
                },
              ].map((feature) => {
                const flag = featureFlags.find(
                  (featureFlag) => featureFlag.key === feature.key,
                );
                const enabled = flag?.enabled ?? true;
                return (
                  <div
                    key={feature.key}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {feature.label}
                      </p>
                      <p className="text-sm text-slate-500">
                        {feature.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.key, !enabled)}
                      className={`p-2 rounded-lg transition ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}
                    >
                      {enabled ? (
                        <ToggleRight size={28} />
                      ) : (
                        <ToggleLeft size={28} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-emerald-900 to-slate-900 p-8 rounded-2xl text-white">
              <div className="flex items-center gap-3 mb-4">
                <Headphones size={32} className="text-emerald-400" />
                <h3 className="text-2xl font-bold">
                  Voice Agent Setup (Cartesia)
                </h3>
              </div>
              <p className="text-emerald-200 mb-6">
                Ultra-realistic AI voice agents powered by Cartesia.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-900 text-white text-xs flex items-center justify-center">
                    1
                  </span>{' '}
                  Get Cartesia API Key
                </h4>
                <ol className="space-y-2 text-sm text-slate-600">
                  <li>
                    1. Go to{' '}
                    <a
                      href="https://play.cartesia.ai"
                      target="_blank"
                      className="text-blue-600 underline"
                      rel="noreferrer"
                    >
                      play.cartesia.ai
                    </a>
                  </li>
                  <li>2. Sign up and navigate to API Keys</li>
                  <li>3. Create and copy your key</li>
                </ol>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-900 text-white text-xs flex items-center justify-center">
                    2
                  </span>{' '}
                  Voice Agent Pricing
                </h4>
                <div className="space-y-2">
                  {VOICE_AGENT_PRICING.map((tier) => (
                    <div
                      key={tier.id}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded text-sm"
                    >
                      <span className="font-medium text-slate-700">
                        {tier.name}
                      </span>
                      <span className="font-bold text-emerald-600">
                        ${tier.price}/mo
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'invites' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-purple-900 to-slate-900 p-8 rounded-2xl text-white">
              <div className="flex items-center gap-3 mb-4">
                <UserPlus size={32} className="text-purple-400" />
                <h3 className="text-2xl font-bold">
                  Send Admin & Partner Invites
                </h3>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4">
                  Send New Invite
                </h4>
                <div className="space-y-4">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as 'ADMIN' | 'RESELLER')
                    }
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="ADMIN">Admin (Full Access)</option>
                    <option value="RESELLER">Partner/Reseller</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSendInvite}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-900 text-white rounded-lg hover:bg-blue-950 font-bold"
                  >
                    <Send size={18} /> Send Invite
                  </button>
                  {inviteSent && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm">
                      <CheckCircle size={16} /> Invite created!
                    </div>
                  )}
                  {inviteError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertTriangle size={16} /> Failed to send invite
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4">
                  Pending Applications
                </h4>
                {partners
                  .filter((p) => p.status === 'Pending')
                  .map((partner) => (
                    <div
                      key={partner.id}
                      className="flex justify-between items-center p-3 bg-orange-50 rounded-lg mb-2"
                    >
                      <span className="text-sm text-slate-800">
                        {partner.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApprovePartner(partner.id)}
                        className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                {partners.filter((p) => p.status === 'Pending').length ===
                  0 && (
                  <p className="text-slate-400 text-sm">
                    No pending applications
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">
              {editingDiscount ? 'Edit Discount' : 'Create Discount'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Code (e.g., SAVE20)"
                value={discountForm.code}
                onChange={(e) =>
                  setDiscountForm({ ...discountForm, code: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <select
                value={discountForm.type}
                onChange={(e) =>
                  setDiscountForm({ ...discountForm, type: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="percentage">Percentage Off</option>
                <option value="fixed">Fixed Amount</option>
              </select>
              <input
                type="number"
                placeholder="Value"
                value={discountForm.value}
                onChange={(e) =>
                  setDiscountForm({
                    ...discountForm,
                    value: Number(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Description"
                value={discountForm.description}
                onChange={(e) =>
                  setDiscountForm({
                    ...discountForm,
                    description: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="number"
                placeholder="Max Uses"
                value={discountForm.maxUses}
                onChange={(e) =>
                  setDiscountForm({
                    ...discountForm,
                    maxUses: Number(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateDiscount}
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950"
                >
                  {editingDiscount ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFreeCodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">
              {editingFreeCode ? 'Edit Free Code' : 'Create Free Code'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Code"
                value={freeCodeForm.code}
                onChange={(e) =>
                  setFreeCodeForm({ ...freeCodeForm, code: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <select
                value={freeCodeForm.plan}
                onChange={(e) =>
                  setFreeCodeForm({ ...freeCodeForm, plan: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="STARTER">Starter</option>
                <option value="PRO">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
              <input
                type="number"
                placeholder="Duration (days)"
                value={freeCodeForm.durationDays}
                onChange={(e) =>
                  setFreeCodeForm({
                    ...freeCodeForm,
                    durationDays: Number(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Description"
                value={freeCodeForm.description}
                onChange={(e) =>
                  setFreeCodeForm({
                    ...freeCodeForm,
                    description: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFreeCodeModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFreeCode}
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950"
                >
                  {editingFreeCode ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">Generate Batch Codes</h3>
            <div className="space-y-3">
              <select
                value={batchForm.plan}
                onChange={(e) =>
                  setBatchForm({ ...batchForm, plan: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="STARTER">Starter</option>
                <option value="PRO">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
              <input
                type="number"
                placeholder="Duration (days)"
                value={batchForm.durationDays}
                onChange={(e) =>
                  setBatchForm({
                    ...batchForm,
                    durationDays: Number(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="number"
                placeholder="Count (max 100)"
                value={batchForm.count}
                onChange={(e) =>
                  setBatchForm({
                    ...batchForm,
                    count: Math.min(100, Number(e.target.value)),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Prefix (optional)"
                value={batchForm.prefix}
                onChange={(e) =>
                  setBatchForm({ ...batchForm, prefix: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateBatch}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
