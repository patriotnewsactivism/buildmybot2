import type {
  Bot,
  BotDocument,
  Conversation,
  Lead,
  PlanType,
  ResellerStats,
  User,
} from '../types';
import { API_BASE } from './apiConfig';

type AuthContext = {
  userId?: string;
  impersonationToken?: string;
};

let authContext: AuthContext = {};

const buildHeaders = (includeJson: boolean) => {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (authContext.userId) {
    headers['x-user-id'] = authContext.userId;
  }
  if (authContext.impersonationToken) {
    headers['x-impersonation-token'] = authContext.impersonationToken;
  }
  return headers;
};

const request = async (
  path: string,
  options: RequestInit = {},
  includeJson = true,
) => {
  const headers = {
    ...buildHeaders(includeJson),
    ...(options.headers as Record<string, string> | undefined),
  };

  return fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });
};

export const dbService = {
  setAuthContext: (context: AuthContext) => {
    authContext = { ...authContext, ...context };
  },

  clearImpersonation: () => {
    authContext = { ...authContext, impersonationToken: undefined };
  },

  subscribeToBots: (onUpdate: (bots: Bot[]) => void) => {
    const fetchBots = async () => {
      try {
        const response = await request(
          '/clients/bots',
          { method: 'GET' },
          false,
        );
        if (response.ok) {
          const data = await response.json();
          onUpdate(data as Bot[]);
        }
      } catch (error) {
        console.error('Error fetching bots:', error);
      }
    };
    fetchBots();
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  },

  saveBot: async (bot: Bot): Promise<Bot> => {
    try {
      const isNewBot = !bot.id || bot.id === 'new';
      if (isNewBot) {
        const { id, ...botWithoutId } = bot;
        const response = await request('/bots', {
          method: 'POST',
          body: JSON.stringify(botWithoutId),
        });
        if (!response.ok) throw new Error('Failed to create bot');
        return await response.json();
      }
      const response = await request(`/bots/${bot.id}`, {
        method: 'PUT',
        body: JSON.stringify(bot),
      });
      if (!response.ok) throw new Error('Failed to update bot');
      return await response.json();
    } catch (error) {
      console.error('Error saving bot:', error);
      throw error;
    }
  },

  getBotById: async (id: string): Promise<Bot | undefined> => {
    try {
      const response = await request(`/bots/${id}`, { method: 'GET' }, false);
      if (!response.ok) return undefined;
      return await response.json();
    } catch (error) {
      console.error('Error fetching bot:', error);
      return undefined;
    }
  },

  subscribeToLeads: (onUpdate: (leads: Lead[]) => void) => {
    const fetchLeads = async () => {
      try {
        const response = await request(
          '/clients/leads',
          { method: 'GET' },
          false,
        );
        if (response.ok) {
          const data = await response.json();
          onUpdate(data as Lead[]);
        }
      } catch (error) {
        console.error('Error fetching leads:', error);
      }
    };
    fetchLeads();
    const interval = setInterval(fetchLeads, 5000);
    return () => clearInterval(interval);
  },

  saveLead: async (lead: Lead): Promise<Lead> => {
    try {
      const response = await request('/leads', {
        method: 'POST',
        body: JSON.stringify(lead),
      });

      if (!response.ok) throw new Error('Failed to save lead');
      return await response.json();
    } catch (error) {
      console.error('Error saving lead:', error);
      return lead;
    }
  },

  updateLead: async (lead: Lead): Promise<Lead> => {
    try {
      const response = await request(`/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: lead.status,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          score: lead.score,
        }),
      });

      if (!response.ok) throw new Error('Failed to update lead');
      return await response.json();
    } catch (error) {
      console.error('Error updating lead:', error);
      return lead;
    }
  },

  getUser: async (uid: string): Promise<User | null> => {
    const response = await request(`/users/${uid}`, { method: 'GET' }, false);
    if (!response.ok) return null;
    return response.json();
  },

  getUserProfile: async (uid: string): Promise<User | null> => {
    try {
      const response = await request(`/users/${uid}`, { method: 'GET' }, false);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  },

  createUser: async (userData: Omit<User, 'id'>): Promise<User | null> => {
    try {
      const response = await request('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...userData,
          status: userData.status || 'Active',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create user:', response.status, errorData);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  },

  saveUserProfile: async (user: User): Promise<User | null> => {
    try {
      const response = await request(`/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...user,
          status: user.status || 'Active',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }
      return await response.json();
    } catch (error) {
      console.error('Error saving user profile:', error);
      return null;
    }
  },

  updateUserPlan: async (uid: string, plan: PlanType): Promise<void> => {
    try {
      await request(`/users/${uid}`, {
        method: 'PUT',
        body: JSON.stringify({ plan }),
      });
    } catch (error) {
      console.error('Error updating plan:', error);
    }
  },

  subscribeToReferrals: (
    resellerCode: string,
    onUpdate: (users: User[]) => void,
  ) => {
    const fetchReferrals = async () => {
      try {
        const response = await request(
          `/users/referrals/${resellerCode}`,
          { method: 'GET' },
          false,
        );
        if (response.ok) {
          const data = await response.json();
          onUpdate(data as User[]);
        }
      } catch (error) {
        console.error('Error fetching referrals:', error);
      }
    };
    fetchReferrals();
    const interval = setInterval(fetchReferrals, 10000);
    return () => clearInterval(interval);
  },

  subscribeToResellerSummary: (
    resellerCode: string,
    onUpdate: (users: User[], stats: ResellerStats) => void,
  ) => {
    const fetchSummary = async () => {
      try {
        const response = await request(
          `/resellers/${resellerCode}/summary`,
          { method: 'GET' },
          false,
        );
        if (response.ok) {
          const data = await response.json();
          onUpdate((data.users || []) as User[], data.stats as ResellerStats);
        }
      } catch (error) {
        console.error('Error fetching reseller summary:', error);
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 10000);
    return () => clearInterval(interval);
  },

  getAllUsers: async (): Promise<User[]> => {
    try {
      const response = await request('/users', { method: 'GET' }, false);
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  },

  updateUserStatus: async (
    uid: string,
    status: 'Active' | 'Suspended',
  ): Promise<void> => {
    try {
      await request(`/users/${uid}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  },

  approvePartner: async (uid: string): Promise<void> => {
    try {
      await request(`/admin/partners/${uid}/approve`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error approving partner:', error);
    }
  },

  subscribeToConversations: (
    onUpdate: (conversations: Conversation[]) => void,
    userId?: string,
  ) => {
    const fetchConversations = async () => {
      try {
        const url = userId
          ? `/conversations?userId=${userId}`
          : '/conversations';
        const response = await request(url, { method: 'GET' }, false);
        if (response.ok) {
          const data = await response.json();
          onUpdate(data as Conversation[]);
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    };
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  },

  saveConversation: async (
    conversation: Conversation,
  ): Promise<Conversation> => {
    try {
      const method = conversation.id ? 'PUT' : 'POST';
      const url = conversation.id
        ? `/conversations/${conversation.id}`
        : '/conversations';

      const response = await request(url, {
        method,
        body: JSON.stringify(conversation),
      });

      if (!response.ok) throw new Error('Failed to save conversation');
      return await response.json();
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  },

  getConversationById: async (
    id: string,
  ): Promise<Conversation | undefined> => {
    try {
      const response = await request(
        `/conversations/${id}`,
        { method: 'GET' },
        false,
      );
      if (!response.ok) return undefined;
      return await response.json();
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return undefined;
    }
  },

  getBotDocuments: async (botId: string): Promise<BotDocument[]> => {
    try {
      const response = await request(
        `/bots/${botId}/documents`,
        { method: 'GET' },
        false,
      );
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('Error fetching documents:', error);
      return [];
    }
  },

  uploadBotDocument: async (
    botId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<BotDocument | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('Upload failed'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));

        xhr.open('POST', `${API_BASE}/bots/${botId}/documents`);
        if (authContext.userId) {
          xhr.setRequestHeader('x-user-id', authContext.userId);
        }
        if (authContext.impersonationToken) {
          xhr.setRequestHeader(
            'x-impersonation-token',
            authContext.impersonationToken,
          );
        }
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      return null;
    }
  },

  deleteBotDocument: async (docId: string): Promise<boolean> => {
    try {
      const response = await request(
        `/documents/${docId}`,
        { method: 'DELETE' },
        false,
      );
      return response.ok;
    } catch (error) {
      console.error('Error deleting document:', error);
      return false;
    }
  },

  getAdminMetrics: async () => {
    const response = await request('/admin/metrics', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load metrics');
    return response.json();
  },

  getAdminUsers: async (params?: Record<string, string>) => {
    const searchParams = params ? `?${new URLSearchParams(params)}` : '';
    const response = await request(
      `/admin/users${searchParams}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load users');
    return response.json();
  },

  getAdminPartners: async () => {
    const response = await request('/admin/partners', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load partners');
    return response.json();
  },

  getAdminPartnerLeaderboard: async () => {
    const response = await request(
      '/admin/partners/leaderboard',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load partner leaderboard');
    return response.json();
  },

  getAdminFinancialOverview: async () => {
    const response = await request(
      '/admin/financial/overview',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load financial overview');
    return response.json();
  },

  getAdminStripeHealth: async () => {
    const response = await request(
      '/admin/financial/stripe-health',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load Stripe health');
    return response.json();
  },

  getAdminInvoices: async () => {
    const response = await request(
      '/admin/financial/invoices',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load invoices');
    return response.json();
  },

  getAdminRefunds: async () => {
    const response = await request(
      '/admin/financial/refunds',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load refunds');
    return response.json();
  },

  getAdminPayouts: async () => {
    const response = await request('/admin/payouts', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load payouts');
    return response.json();
  },

  bulkUpdateUsers: async (payload: { userIds: string[]; action: string }) => {
    const response = await request('/admin/users/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update users');
    return response.json();
  },

  getUserUsage: async (userId: string) => {
    const response = await request(
      `/admin/users/${userId}/usage`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load usage');
    return response.json();
  },

  exportUserData: async (userId: string) => {
    const response = await request(
      `/admin/users/${userId}/export`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to export user data');
    return response.json();
  },

  mergeUsers: async (sourceUserId: string, targetUserId: string) => {
    const response = await request('/admin/users/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceUserId, targetUserId }),
    });
    if (!response.ok) throw new Error('Failed to merge users');
    return response.json();
  },

  getAdminAnalyticsSummary: async () => {
    const response = await request(
      '/admin/analytics/summary',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load analytics summary');
    return response.json();
  },

  getSystemSettings: async () => {
    const response = await request(
      '/admin/system/settings',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load system settings');
    return response.json();
  },

  updateSystemSettings: async (payload: {
    maintenanceMode: boolean;
    envOverrides: Record<string, unknown>;
  }) => {
    const response = await request('/admin/system/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update system settings');
    return response.json();
  },

  updateFeatureFlag: async (payload: {
    key: string;
    description?: string;
    enabled: boolean;
  }) => {
    const response = await request('/admin/system/feature-flags', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update feature flag');
    return response.json();
  },

  updateEmailTemplate: async (payload: {
    id?: string;
    name: string;
    subject: string;
    body: string;
    scope?: string;
  }) => {
    const response = await request('/admin/system/email-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update email template');
    return response.json();
  },

  rotateApiKey: async (name: string) => {
    const response = await request('/admin/system/api-keys/rotate', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to rotate API key');
    return response.json();
  },

  getSupportTickets: async () => {
    const response = await request('/admin/support', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load support tickets');
    return response.json();
  },

  updateSupportTicket: async (
    id: string,
    payload: { status?: string; priority?: string },
  ) => {
    const response = await request(`/admin/support/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update support ticket');
    return response.json();
  },

  startImpersonation: async (
    targetUserId: string,
    reason: string,
    durationMinutes?: number,
  ) => {
    const response = await request('/impersonation/start', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, reason, durationMinutes }),
    });
    if (!response.ok) throw new Error('Failed to start impersonation');
    const data = await response.json();
    authContext = { ...authContext, impersonationToken: data.token };
    return data;
  },

  endImpersonation: async (token: string) => {
    const response = await request('/impersonation/end', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error('Failed to end impersonation');
    authContext = { ...authContext, impersonationToken: undefined };
    return response.json();
  },

  getActiveImpersonations: async () => {
    const response = await request(
      '/impersonation/active',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load impersonations');
    return response.json();
  },

  getPartnerClients: async () => {
    const response = await request(
      '/partners/clients',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load clients');
    return response.json();
  },

  getPartnerCommissions: async () => {
    const response = await request(
      '/partners/commissions',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load commissions');
    return response.json();
  },

  getPartnerMarketingMaterials: async () => {
    const response = await request(
      '/partners/marketing-materials',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load materials');
    return response.json();
  },

  getPartnerAnalytics: async () => {
    const response = await request(
      '/partners/analytics',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load analytics');
    return response.json();
  },

  getPartnerNotes: async (clientId?: string) => {
    const query = clientId ? `?clientId=${clientId}` : '';
    const response = await request(
      `/partners/notes${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load notes');
    return response.json();
  },

  createPartnerNote: async (payload: { clientId?: string; note: string }) => {
    const response = await request('/partners/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create note');
    return response.json();
  },

  getPartnerTasks: async (clientId?: string) => {
    const query = clientId ? `?clientId=${clientId}` : '';
    const response = await request(
      `/partners/tasks${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load tasks');
    return response.json();
  },

  createPartnerTask: async (payload: {
    clientId?: string;
    title: string;
    status?: string;
    dueAt?: string;
  }) => {
    const response = await request('/partners/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create task');
    return response.json();
  },

  updatePartnerTask: async (
    taskId: string,
    payload: { title?: string; status?: string; dueAt?: string },
  ) => {
    const response = await request(`/partners/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update task');
    return response.json();
  },

  logPartnerEmail: async (payload: {
    clientId: string;
    subject: string;
    body: string;
  }) => {
    const response = await request('/partners/communications/email', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to log email');
    return response.json();
  },

  getClientOverview: async () => {
    const response = await request(
      '/clients/overview',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load overview');
    return response.json();
  },

  getClientBots: async () => {
    const response = await request('/clients/bots', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load bots');
    return response.json();
  },

  getClientLeads: async (status?: string) => {
    const query = status ? `?status=${status}` : '';
    const response = await request(
      `/clients/leads${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load leads');
    return response.json();
  },

  getClientAnalytics: async (days = 30) => {
    const response = await request(
      `/clients/analytics?days=${days}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load analytics');
    return response.json();
  },

  completeOnboarding: async () => {
    const response = await request('/clients/onboarding/complete', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to complete onboarding');
    return response.json();
  },

  trackClientEvent: async (payload: {
    eventType: string;
    eventData?: any;
    botId?: string;
  }) => {
    const response = await request('/clients/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to track event');
    return response.json();
  },

  getTemplates: async (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    const response = await request(
      `/templates${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load templates');
    return response.json();
  },

  installTemplate: async (templateId: string) => {
    const response = await request(`/templates/${templateId}/install`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to install template');
    return response.json();
  },

  getAdminDiscountCodes: async () => {
    const response = await request(
      '/admin/discount-codes',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load discount codes');
    return response.json();
  },

  createDiscountCode: async (payload: any) => {
    const response = await request('/admin/discount-codes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create discount code');
    return response.json();
  },

  updateDiscountCode: async (id: string, payload: any) => {
    const response = await request(`/admin/discount-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update discount code');
    return response.json();
  },

  deleteDiscountCode: async (id: string) => {
    const response = await request(`/admin/discount-codes/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete discount code');
    return response.json();
  },

  getAdminFreeCodes: async () => {
    const response = await request(
      '/admin/free-codes',
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load free codes');
    return response.json();
  },

  createFreeCode: async (payload: any) => {
    const response = await request('/admin/free-codes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create free code');
    return response.json();
  },

  updateFreeCode: async (id: string, payload: any) => {
    const response = await request(`/admin/free-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update free code');
    return response.json();
  },

  deleteFreeCode: async (id: string) => {
    const response = await request(`/admin/free-codes/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete free code');
    return response.json();
  },

  generateFreeCodeBatch: async (payload: {
    plan: string;
    durationDays: number;
    count: number;
    prefix?: string;
    validUntil?: string;
  }) => {
    const response = await request('/admin/free-codes/generate-batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to generate codes');
    return response.json();
  },

  getAdminPlans: async () => {
    const response = await request('/admin/plans', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load plans');
    return response.json();
  },

  syncPlansToStripe: async () => {
    const response = await request('/admin/plans/sync-stripe', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to sync plans');
    return response.json();
  },

  getAdminOrganizations: async (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    const response = await request(
      `/admin/organizations${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load organizations');
    return response.json();
  },

  updateOrganization: async (id: string, payload: any) => {
    const response = await request(`/admin/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update organization');
    return response.json();
  },

  deleteOrganization: async (id: string) => {
    const response = await request(`/admin/organizations/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete organization');
    return response.json();
  },

  getAdminBots: async (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    const response = await request(
      `/admin/bots${query}`,
      { method: 'GET' },
      false,
    );
    if (!response.ok) throw new Error('Failed to load bots');
    return response.json();
  },

  updateAdminBot: async (id: string, payload: any) => {
    const response = await request(`/admin/bots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update bot');
    return response.json();
  },

  deleteAdminBot: async (id: string) => {
    const response = await request(`/admin/bots/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete bot');
    return response.json();
  },

  getNotifications: async () => {
    const response = await request('/notifications', { method: 'GET' }, false);
    if (!response.ok) throw new Error('Failed to load notifications');
    return response.json();
  },

  markNotificationViewed: async (notificationId: string) => {
    const response = await request(`/notifications/${notificationId}/view`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to mark notification as viewed');
    return response.json();
  },

  acknowledgeNotification: async (notificationId: string) => {
    const response = await request(
      `/notifications/${notificationId}/acknowledge`,
      { method: 'POST' },
    );
    if (!response.ok) throw new Error('Failed to acknowledge notification');
    return response.json();
  },

  markAllNotificationsViewed: async (notificationIds: string[]) => {
    const results = await Promise.all(
      notificationIds.map((id) =>
        request(`/notifications/${id}/view`, { method: 'POST' })
          .then((res) => res.ok)
          .catch(() => false),
      ),
    );
    return results.every(Boolean);
  },
};
